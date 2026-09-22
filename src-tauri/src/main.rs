// Nota 的可执行入口。
//
// 这里刻意什么都不做，只把控制权交给 nota_lib::run()——Tauri 2 的标准形状。
// 逻辑全在 lib 里，好处是将来要加第二个二进制（比如 `nota --convert` 这种
// 命令行转换器）时，直接 use nota_lib 即可，不用把代码搬来搬去。

// Windows release 构建下不要弹一个多余的控制台窗口。
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    nota_lib::run()
}
