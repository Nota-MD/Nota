//! 真的把请求发出去。**`upload` 这一块里唯一碰网络的地方。**
//!
//! 上面那一层的算式（拼多部件体、解析请求头、按点路径从响应里取地址）全在
//! `upload.rs` 里，是纯函数；这里只做三件事：把算式的结果塞进一个 ureq 请求、
//! 发出去、把响应体交给 `从响应取地址`。
//!
//! ⚠️ 与 `lua/api/http.rs` 的规矩故意不同（见 `upload.rs` 文件头）：这里
//! `http://` 放行——地址是用户填的自家服务器。相同的是三条底线：**有超时、
//! 有响应大小上限、不跟重定向到别的域之外**。
//!
//! ⚠️ **请求头里的 token 只进请求，不进任何一句话**：下面每一处错误文案都只带
//! 地址与服务端的回话，绝不拼请求头。否则一次失败就会把用户的密钥印在界面的
//! 提示条上、印在日志里、印进用户贴给别人看的截图里。

use super::{
    上传方法, 上传设置, 从响应取地址, 内容类型, 多部件体_表单, 多部件体_文件, 新边界, 校验,
    短, 网络图不能用_put, 解析请求头,
};
use crate::error::{NotaError, Result};

/// 一次上传最多送出去多少字节。超了**报错**（不是截断）。
///
/// ⚠️ 比 `image/plan.rs` 的下载上限（16 MiB）大一倍，理由不一样：那张图是要
/// **进文档**的（太大就不该走 IPC），而这里的图是用户自己选的要发到自家服务器
/// 上的——一张手机照片 5～8 MB、一张相机原图 20 MB 都算正常。32 MiB 是"够了"
/// 与"别把内存吃光"之间的那条线（这一整份体是**在内存里拼出来的**）。
const 上传上限: usize = 32 * 1024 * 1024;

/// 一次上传最多收多少响应字节。
///
/// ⚠️ 图床的回话是一条几行的 JSON，1 MiB 已经宽得离谱。给上限不是小气：
/// 服务器回一整页 HTML（或者一个流）时，这里不设限就是**一直读下去**。
const 响应上限: u64 = 1024 * 1024;

/// 上传超时（整个请求，含连接与读响应）。
///
/// ⚠️ 比下载那条（30 秒）长：上传要先把 32 MiB 推出去，慢线路上 30 秒不够，
/// 而"超时"在这里的表现是"图传了一半被掐断"，用户会以为服务器坏了。
const 上传超时: std::time::Duration = std::time::Duration::from_secs(60);

/// 这次要传的是什么。
///
/// ⚠️ 两条路的区别是**谁来取这份字节**：本地那条是 Nota 读出来发上去；
/// 网络那条 Nota **一个字节都不取**，只把地址交给服务器自己去拿
/// （理由见 `upload.rs` 文件头）。
#[derive(Debug, Clone)]
pub enum 传什么 {
    /// 磁盘上（或剪贴板）的一张图。字节已经读进来了，文件名用来猜内容类型。
    本地 { 字节: Vec<u8>, 文件名: String },
    /// 一条网络地址。⚠️ 只在 `remote_field` 非空时走得通（`put` 会报错）。
    网络 { 原地址: String },
}

impl 传什么 {
    pub fn 是网络(&self) -> bool {
        matches!(self, 传什么::网络 { .. })
    }
}

/// 传一次，拿回那条地址。
///
/// 调用方负责放进 `spawn_blocking`：这是个**同步**函数，最长会阻塞 60 秒。
pub fn 传一次(设置: &上传设置, 内容: 传什么) -> Result<String> {
    let 是网络 = 内容.是网络();
    校验(设置, 是网络)?;

    let 地址 = 设置.url.trim().to_string();
    let 方法 = match 设置.method {
        上传方法::Post => "POST",
        上传方法::Put => "PUT",
    };

    // ⚠️ 请求头在**外面**解析过一次（`校验` 里），这里再解析一次是为了拿到值；
    // 两处调的是同一个纯函数，不存在"校验的规则和发出去的规则不一样"。
    let 所有头 = 解析请求头(&设置.headers)?;
    // `content-type` 单独挑出来：它在两种方法下的归属不同（见下面那条 match）。
    let 用户内容类型 = 所有头
        .iter()
        .find(|(名, _)| 名.eq_ignore_ascii_case("content-type"))
        .map(|(_, 值)| 值.clone());
    let 其它头: Vec<(String, String)> = 所有头
        .into_iter()
        .filter(|(名, _)| !名.eq_ignore_ascii_case("content-type"))
        .collect();

    let (体, 内容类型头) = match (设置.method, 内容) {
        (上传方法::Post, 传什么::本地 { 字节, 文件名 }) => {
            检查大小(字节.len())?;
            let 边界 = 新边界();
            let 类型 = 内容类型(&文件名);
            let 头 = format!("multipart/form-data; boundary={边界}");
            (多部件体_文件(&边界, 设置.field.trim(), &文件名, 类型, &字节), 头)
        }
        (上传方法::Post, 传什么::网络 { 原地址 }) => {
            // 网络图片不下载，所以这里没有字节，也就没有大小上限可查。
            let 边界 = 新边界();
            let 字段 = 设置.remote_field.trim().to_string();
            let 头 = format!("multipart/form-data; boundary={边界}");
            (多部件体_表单(&边界, &[(字段, 原地址)]), 头)
        }
        (上传方法::Put, 传什么::本地 { 字节, 文件名 }) => {
            检查大小(字节.len())?;
            // ⚠️ **用户自填的 content-type 优先**：PUT 的体就是那段字节，
            // 头怎么写是接口约定的一部分（有的服务要 `application/octet-stream`
            // 才认）。没填才按后缀猜。
            (字节, 用户内容类型.unwrap_or_else(|| 内容类型(&文件名).to_string()))
        }
        // `校验` 已经挡下这一支了，这里再给一次错误而不是 `unreachable!()`：
        // 一个 Tauri 命令里 panic 会把整条 IPC 打成一句"任务没跑起来"。
        (上传方法::Put, 传什么::网络 { .. }) => return Err(网络图不能用_put()),
    };

    let ua = format!("Nota/{}", env!("CARGO_PKG_VERSION"));
    let 配置 = ureq::Agent::config_builder()
        .http_status_as_error(false)
        .max_redirects(5)
        .timeout_global(Some(上传超时))
        .user_agent(ua.clone())
        .build();

    let mut 构造 = ureq::http::Request::builder()
        .method(方法)
        .uri(&地址)
        .header("user-agent", ua);
    for (名, 值) in 其它头 {
        构造 = 构造.header(名, 值);
    }
    // ⚠️ 放在最后：上面那些是用户写的，这一个由本应用说了算（POST 时它必须
    // 带边界，不然体没法解析）。用户也写了一行 `content-type` 的话，
    // 那一行在上面被挑走了，不会出现两个同名的头。
    构造 = 构造.header("content-type", 内容类型头);

    let 请求 = 构造
        .body(体)
        .map_err(|e| NotaError::other(format!("上传请求拼不起来（{地址}）：{e}")))?;

    let mut 响应 = ureq::Agent::new_with_config(配置)
        .run(请求)
        .map_err(|e| NotaError::other(format!("上传失败（{地址}）：{e}")))?;

    let code = 响应.status().as_u16();
    let 读 = 响应
        .body_mut()
        .with_config()
        .limit(响应上限)
        .read_to_string();

    if !(200..300).contains(&code) {
        let 回话 = 读.as_deref().map(短).unwrap_or_default();
        // ⚠️ 服务端回的话原样带上（截行、限长）：图床拒绝时那句英文/中文
        // （"token 无效" / "file too large"）才是用户真正要看的线索。
        return Err(NotaError::other(format!(
            "上传失败（{地址}）：服务器回了 {code}{}",
            if 回话.is_empty() {
                String::new()
            } else {
                format!("：{回话}")
            }
        )));
    }

    let 体 = 读.map_err(|e| {
        NotaError::other(format!(
            "上传成功但响应读不出来（{地址}）：{e}（上限 {响应上限} 字节，超了也算失败）"
        ))
    })?;
    从响应取地址(&体, &设置.url_path)
}

/// 体量闸。**报错不截断**：半张图传上去比不传更糟——服务器会当它是一张完整的
/// 图存下来，而它打开是坏的。
fn 检查大小(字节数: usize) -> Result<()> {
    if 字节数 > 上传上限 {
        return Err(NotaError::other(format!(
            "这张图 {:.1} MB，超过 {:.0} MB 的上传上限——先压小一点再传",
            字节数 as f64 / 1048576.0,
            上传上限 as f64 / 1048576.0
        )));
    }
    Ok(())
}
