use std::time::Duration;

use mlua::{Lua, Table, Value};

use super::{lua_err, lua_to_json, mlua_to_nota};
use crate::error::{NotaError, Result as NotaResult};

const DEFAULT_CHAO_SHI: Duration = Duration::from_secs(30);

const ZUI_ZHANG_CHAO_SHI: Duration = Duration::from_secs(180);

const XIANG_YING_SHANG_XIAN: u64 = 2 * 1024 * 1024;

const QING_QIU_SHANG_XIAN: usize = 1024 * 1024;

const ZUI_DA_ZHONG_DING_XIANG: u32 = 5;

const YUN_XU_DE_FANG_FA: [&str; 6] = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD"];

struct HttpResponse {
    code: u16,
    text: String,
}

enum RequestOutcome {
    Response(HttpResponse),

    Streamed {
        bao: HttpResponse,
        kuai_shu: usize,
        zhong_duan: bool,
    },

    EnvironmentFailure(String),
}

pub fn build(lua: &Lua) -> NotaResult<Table> {
    let t = lua.create_table().map_err(mlua_to_nota)?;

    let request = lua
        .create_function(move |lua, spec: Table| receive_kou(lua, emit_yi_ci(lua, &spec)))
        .map_err(mlua_to_nota)?;
    t.set("request", request).map_err(mlua_to_nota)?;

    for (ming, fang_fa) in [("get", "GET"), ("post", "POST")] {
        let f = lua
            .create_function(move |lua, spec: Value| {
                let spec = gui_yi_hua(lua, spec, fang_fa)?;
                receive_kou(lua, emit_yi_ci(lua, &spec))
            })
            .map_err(mlua_to_nota)?;
        t.set(ming, f).map_err(mlua_to_nota)?;
    }

    let stream = lua
        .create_function(move |lua, (spec, receive_dao): (Table, mlua::Function)| {
            receive_kou(lua, liu_shi(lua, &spec, &receive_dao))
        })
        .map_err(mlua_to_nota)?;
    t.set("stream", stream).map_err(mlua_to_nota)?;

    Ok(t)
}

fn receive_kou(lua: &Lua, r: NotaResult<RequestOutcome>) -> mlua::Result<Table> {
    let out = lua.create_table()?;
    let (bao, liu) = match r {
        Err(e) => return Err(lua_err(e)),
        Ok(RequestOutcome::EnvironmentFailure(wei_shen_me)) => {
            out.set("ok", false)?;
            out.set("error", wei_shen_me)?;
            return Ok(out);
        }
        Ok(RequestOutcome::Response(bao)) => (bao, None),
        Ok(RequestOutcome::Streamed {
            bao,
            kuai_shu,
            zhong_duan,
        }) => (bao, Some((kuai_shu, zhong_duan))),
    };
    out.set("ok", true)?;
    out.set("code", bao.code)?;
    if let Some((kuai_shu, zhong_duan)) = liu {
        out.set("chunks", kuai_shu)?;

        if zhong_duan {
            out.set("aborted", true)?;
        }
    }
    if let Ok(v) = serde_json::from_str::<serde_json::Value>(&bao.text) {
        out.set("json", super::json_to_lua(lua, &v)?)?;
    }
    out.set("text", bao.text)?;
    Ok(out)
}

fn gui_yi_hua(lua: &Lua, spec: Value, fang_fa: &str) -> mlua::Result<Table> {
    match spec {
        Value::String(s) => {
            let t = lua.create_table()?;
            t.set("url", s)?;
            t.set("method", fang_fa)?;
            Ok(t)
        }
        Value::Table(t) => {
            if t.get::<Option<String>>("method")?.is_none() {
                t.set("method", fang_fa)?;
            }
            Ok(t)
        }
        other => Err(mlua::Error::RuntimeError(format!(
            "nota.http.{}(...) expects a URL string or request table, received {}",
            fang_fa.to_lowercase(),
            lei_xing_ming(&other)
        ))),
    }
}

fn write_le_content_type(headers: &Table) -> bool {
    headers
        .pairs::<String, Value>()
        .flatten()
        .any(|(k, _)| k.eq_ignore_ascii_case("content-type"))
}

fn pin_qing_qiu(lua: &Lua, spec: &Table) -> NotaResult<ureq::http::Request<Vec<u8>>> {
    let url: String = spec
        .get("url")
        .map_err(|_| NotaError::other("nota.http requires a `url` field"))?;
    check_address(&url)?;

    let fang_fa = spec
        .get::<Option<String>>("method")
        .ok()
        .flatten()
        .unwrap_or_else(|| "GET".to_owned())
        .to_ascii_uppercase();
    if !YUN_XU_DE_FANG_FA.contains(&fang_fa.as_str()) {
        return Err(NotaError::other(format!(
            "Unsupported HTTP method `{fang_fa}`; allowed methods: {}",
            YUN_XU_DE_FANG_FA.join(" / ")
        )));
    }

    let mut req = ureq::http::Request::builder()
        .method(fang_fa.as_str())
        .uri(&url);

    req = req.header("user-agent", format!("Nota/{}", env!("CARGO_PKG_VERSION")));

    let mut shi_json = false;
    let tou_table = spec.get::<Option<Table>>("headers").ok().flatten();
    let zi_ji_write_le_content_type = tou_table.as_ref().is_some_and(write_le_content_type);
    if let Some(headers) = tou_table {
        for pair in headers.pairs::<String, Value>() {
            let (k, v) = pair.map_err(mlua_to_nota)?;

            let vs = match v {
                Value::String(s) => s.to_string_lossy().to_string(),
                Value::Integer(i) => i.to_string(),
                Value::Number(n) => n.to_string(),
                Value::Boolean(b) => b.to_string(),
                Value::Nil => continue,
                other => {
                    return Err(NotaError::other(format!(
                        "Header `{k}` has type {}; only string, number, and boolean values are supported",
                        lei_xing_ming(&other)
                    )))
                }
            };
            req = req.header(k.as_str(), vs);
        }
    }

    let mut body: Vec<u8> = Vec::new();
    match spec.get::<Value>("body") {
        Err(_) | Ok(Value::Nil) => {}
        Ok(Value::String(s)) => body = s.as_bytes().to_vec(),
        Ok(Value::Table(t)) => {
            let json = lua_to_json(lua, Value::Table(t)).map_err(mlua_to_nota)?;
            body = serde_json::to_vec(&json).map_err(|e| {
                NotaError::other(format!("Could not encode the request body as JSON: {e}"))
            })?;
            shi_json = true;
        }
        Ok(other) => {
            return Err(NotaError::other(format!(
                "The request body must be text or a table encoded as JSON, not {}",
                lei_xing_ming(&other)
            )))
        }
    }
    if body.len() > QING_QIU_SHANG_XIAN {
        return Err(NotaError::other(format!(
            "The request body is {} bytes, above the {QING_QIU_SHANG_XIAN} byte limit",
            body.len()
        )));
    }
    if shi_json && !zi_ji_write_le_content_type {
        req = req.header("content-type", "application/json");
    }

    let qing_qiu = req
        .body(body)
        .map_err(|e| NotaError::other(format!("Could not build the request: {e}")))?;
    Ok(qing_qiu)
}

fn dai_li(spec: &Table) -> NotaResult<ureq::Agent> {
    let shi_xian = chao_shi(spec)?;
    Ok(ureq::Agent::new_with_config(
        ureq::Agent::config_builder()
            .http_status_as_error(false)
            .max_redirects(ZUI_DA_ZHONG_DING_XIANG)
            .timeout_global(None)
            .timeout_per_call(None)
            .timeout_resolve(Some(shi_xian))
            .timeout_connect(Some(shi_xian))
            .timeout_send_request(Some(shi_xian))
            .timeout_recv_response(None)
            .timeout_recv_body(Some(shi_xian))
            .user_agent(format!("Nota/{}", env!("CARGO_PKG_VERSION")))
            .build(),
    ))
}

fn emit_yi_ci(lua: &Lua, spec: &Table) -> NotaResult<RequestOutcome> {
    let qing_qiu = pin_qing_qiu(lua, spec)?;
    let shi_xian = chao_shi(spec)?;

    let mut resp = match dai_li(spec)?.run(qing_qiu) {
        Ok(r) => r,
        Err(e) => {
            return Ok(RequestOutcome::EnvironmentFailure(format!(
                "Request failed: {e}"
            )))
        }
    };

    let code = resp.status().as_u16();
    let text = match resp
        .body_mut()
        .with_config()
        .limit(XIANG_YING_SHANG_XIAN)
        .read_to_string()
    {
        Ok(t) => t,
        Err(e) => {
            return Ok(RequestOutcome::EnvironmentFailure(
                read_xiang_ying_shi_bai_de_hua(&e, shi_xian),
            ))
        }
    };

    Ok(RequestOutcome::Response(HttpResponse { code, text }))
}

fn read_xiang_ying_shi_bai_de_hua(e: &ureq::Error, shi_xian: Duration) -> String {
    match e {
        ureq::Error::BodyExceedsLimit(_) => {
            format!("The response body exceeded the {XIANG_YING_SHANG_XIAN} byte limit: {e}")
        }

        ureq::Error::Timeout(_) => format!(
            "Timed out reading the response after {} seconds without new data: {e}",
            shi_xian.as_secs()
        ),
        _ => format!("Could not read the response: {e}"),
    }
}

fn read_xiang_ying_shi_bai_de_hua_io(e: &std::io::Error, shi_xian: Duration) -> String {
    match e.kind() {
        std::io::ErrorKind::TimedOut => {
            format!(
                "Timed out reading the response after {} seconds without new data: {e}",
                shi_xian.as_secs()
            )
        }
        _ => {
            let yuan_hua = e.to_string();
            if yuan_hua.contains("BodyExceedsLimit") || yuan_hua.contains("limit") {
                format!("The response body exceeded the {XIANG_YING_SHANG_XIAN} byte limit: {e}")
            } else {
                format!("Could not read the response: {e}")
            }
        }
    }
}

fn liu_shi(lua: &Lua, spec: &Table, receive_dao: &mlua::Function) -> NotaResult<RequestOutcome> {
    let qing_qiu = pin_qing_qiu(lua, spec)?;
    let shi_xian = chao_shi(spec)?;

    let mut resp = match dai_li(spec)?.run(qing_qiu) {
        Ok(r) => r,
        Err(e) => {
            return Ok(RequestOutcome::EnvironmentFailure(format!(
                "Request failed: {e}"
            )))
        }
    };

    let code = resp.status().as_u16();
    let mut read_2 = resp
        .body_mut()
        .with_config()
        .limit(XIANG_YING_SHANG_XIAN)
        .reader();

    let mut fulldocument = String::new();
    let mut dai_xu: Vec<u8> = Vec::new();
    let mut kuai_shu = 0usize;
    let mut huan_chong = [0u8; 8192];

    loop {
        let n = match std::io::Read::read(&mut read_2, &mut huan_chong) {
            Ok(0) => break,
            Ok(n) => n,
            Err(e) => {
                return Ok(RequestOutcome::EnvironmentFailure(
                    read_xiang_ying_shi_bai_de_hua_io(&e, shi_xian),
                ))
            }
        };
        dai_xu.extend_from_slice(&huan_chong[..n]);

        while let Some(kuai_2) = qie_chu_wan_zheng_duan(&mut dai_xu) {
            kuai_shu += 1;
            fulldocument.push_str(&kuai_2);

            let hui_hua: Value = receive_dao.call(kuai_2).map_err(mlua_to_nota)?;
            if matches!(hui_hua, Value::Boolean(false)) {
                return Ok(RequestOutcome::Streamed {
                    bao: HttpResponse {
                        code,
                        text: fulldocument,
                    },
                    kuai_shu,
                    zhong_duan: true,
                });
            }
        }
    }

    if !dai_xu.is_empty() {
        let wei_2 = String::from_utf8_lossy(&dai_xu).into_owned();
        kuai_shu += 1;
        fulldocument.push_str(&wei_2);
        let hui_hua: Value = receive_dao.call(wei_2).map_err(mlua_to_nota)?;
        if matches!(hui_hua, Value::Boolean(false)) {
            return Ok(RequestOutcome::Streamed {
                bao: HttpResponse {
                    code,
                    text: fulldocument,
                },
                kuai_shu,
                zhong_duan: true,
            });
        }
    }

    Ok(RequestOutcome::Streamed {
        bao: HttpResponse {
            code,
            text: fulldocument,
        },
        kuai_shu,
        zhong_duan: false,
    })
}

fn qie_chu_wan_zheng_duan(buf: &mut Vec<u8>) -> Option<String> {
    if buf.is_empty() {
        return None;
    }
    match std::str::from_utf8(buf) {
        Ok(s) => {
            let out = s.to_owned();
            buf.clear();
            Some(out)
        }
        Err(e) => {
            let ok_de = e.valid_up_to();
            match e.error_len() {
                None => {
                    if ok_de == 0 {
                        return None;
                    }
                    let out = String::from_utf8_lossy(&buf[..ok_de]).into_owned();
                    buf.drain(..ok_de);
                    Some(out)
                }
                Some(huai) => {
                    let mut out = String::from_utf8_lossy(&buf[..ok_de]).into_owned();
                    out.push('\u{FFFD}');
                    buf.drain(..ok_de + huai);
                    Some(out)
                }
            }
        }
    }
}

fn chao_shi(spec: &Table) -> NotaResult<Duration> {
    let ms = spec.get::<Option<u64>>("timeout_ms").ok().flatten();
    let Some(ms) = ms else {
        return Ok(DEFAULT_CHAO_SHI);
    };
    if ms == 0 {
        return Err(NotaError::other("timeout_ms cannot be 0"));
    }
    Ok(Duration::from_millis(ms).min(ZUI_ZHANG_CHAO_SHI))
}

fn check_address(url: &str) -> NotaResult<()> {
    let Some((scheme, rest)) = url.split_once("://") else {
        return Err(NotaError::other(format!(
            "URL `{url}` has no scheme; use `https://...` (local services may use `http://127.0.0.1:...`)"
        )));
    };

    match scheme.to_ascii_lowercase().as_str() {
        "https" => Ok(()),
        "http" => {
            let zhu_ji = qu_zhu_ji(rest);
            if shi_hui_huan(&zhu_ji) {
                Ok(())
            } else {
                Err(NotaError::other(format!(
                    "Refusing a plaintext request to `{zhu_ji}`: `http://` is limited to loopback addresses (127.0.0.1, localhost, ::1); use `https://` for other hosts"
                )))
            }
        }
        other => Err(NotaError::other(format!(
            "Unsupported scheme `{other}://`; use HTTPS or HTTP on a loopback address"
        ))),
    }
}

fn qu_zhu_ji(rest: &str) -> String {
    let authority = rest.split(['/', '?', '#']).next().unwrap_or(rest);

    let host = authority.rsplit('@').next().unwrap_or(authority);

    if let Some(inside) = host.strip_prefix('[') {
        return inside
            .split(']')
            .next()
            .unwrap_or(inside)
            .to_ascii_lowercase();
    }
    host.split(':').next().unwrap_or(host).to_ascii_lowercase()
}

fn shi_hui_huan(host: &str) -> bool {
    matches!(host, "localhost" | "127.0.0.1" | "::1")
}

fn lei_xing_ming(v: &Value) -> &'static str {
    match v {
        Value::Nil => "nil",
        Value::Boolean(_) => "boolean",
        Value::Integer(_) | Value::Number(_) => "number",
        Value::String(_) => "string",
        Value::Table(_) => "table",
        Value::Function(_) => "function",
        Value::Thread(_) => "coroutine",
        Value::UserData(_) | Value::LightUserData(_) => "host object",
        _ => "an unknown value",
    }
}

#[cfg(test)]
mod tests;
