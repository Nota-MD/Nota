use std::path::PathBuf;

use mlua::{Lua, Table, Value};

use super::{lua_err, mlua_to_nota};
use crate::error::{NotaError, Result as NotaResult};
use crate::lua::HostContext;

const ENTER_ONLY_ARGS: &[&str] = &["-C", "--git-dir", "--work-tree", "--namespace"];

pub fn build(lua: &Lua, ctx: &HostContext) -> NotaResult<Table> {
    let t = lua.create_table().map_err(mlua_to_nota)?;

    let ctx2 = ctx.clone();
    let run = lua
        .create_function(move |lua, args: Table| -> mlua::Result<Table> {
            let argv = table_to_argv(&args)?;

            let cwd = match working_dir(&ctx2) {
                Ok(cwd) => cwd,
                Err(msg) => return each_has_work_left_directory_result(lua, "stdout", msg),
            };
            let out = run_git(&cwd, &argv).map_err(lua_err)?;

            let result = lua.create_table()?;
            result.set("code", out.code)?;
            result.set("stdout", out.stdout)?;
            result.set("stderr", out.stderr)?;
            result.set("ok", out.code == 0)?;
            Ok(result)
        })
        .map_err(mlua_to_nota)?;
    t.set("run", run).map_err(mlua_to_nota)?;

    let parse_status = lua
        .create_function(move |lua, raw: String| -> mlua::Result<Table> {
            let (branch, entries) = parse_status_2(&raw);

            let t = lua.create_table()?;
            t.set("branch", branch)?;
            let list = lua.create_table()?;
            for (i, e) in entries.into_iter().enumerate() {
                let item = lua.create_table()?;
                item.set("index", e.index)?;
                item.set("work", e.work)?;
                item.set("path", e.path)?;

                if let Some(orig) = e.orig {
                    item.set("orig", orig)?;
                }
                item.set("state", e.state)?;

                list.set(i + 1, item)?;
            }
            t.set("entries", list)?;
            Ok(t)
        })
        .map_err(mlua_to_nota)?;
    t.set("parse_status", parse_status).map_err(mlua_to_nota)?;

    let ctx2 = ctx.clone();
    let log_graph = lua
        .create_function(move |lua, n: Option<i64>| -> mlua::Result<Table> {
            let cwd = match working_dir(&ctx2) {
                Ok(cwd) => cwd,
                Err(msg) => return each_has_work_left_directory_result(lua, "rows", msg),
            };

            let n = n.unwrap_or(60).clamp(1, 200).to_string();
            let out = run_git(
                &cwd,
                &[
                    "log",
                    "--graph",
                    "--date-order",
                    "--no-color",
                    "-n",
                    &n,
                    IMAGE_IS,
                ],
            )
            .map_err(lua_err)?;

            let t = lua.create_table()?;
            t.set("code", out.code)?;
            t.set("ok", out.code == 0)?;
            t.set("stderr", out.stderr)?;
            let rows = lua.create_table()?;
            for (i, row) in parse_image_date_only(&out.stdout).into_iter().enumerate() {
                let item = lua.create_table()?;
                item.set("art", row.art)?;
                if let Some(hash) = row.hash {
                    item.set("hash", hash)?;
                    item.set("parent", row.parent)?;
                    item.set("refs", row.refs)?;
                    item.set("subject", row.subject)?;
                }
                rows.set(i + 1, item)?;
            }
            t.set("rows", rows)?;
            Ok(t)
        })
        .map_err(mlua_to_nota)?;
    t.set("log_graph", log_graph).map_err(mlua_to_nota)?;

    let ctx2 = ctx.clone();
    let status = lua
        .create_function(move |lua, ()| -> mlua::Result<Table> {
            let cwd = match working_dir(&ctx2) {
                Ok(cwd) => cwd,
                Err(msg) => return each_has_work_left_directory_result(lua, "raw", msg),
            };

            let out = run_git(&cwd, &["status", "--porcelain=v1", "-z", "-b"]).map_err(lua_err)?;
            let result = lua.create_table()?;
            result.set("code", out.code)?;
            result.set("raw", out.stdout)?;
            result.set("stderr", out.stderr)?;
            Ok(result)
        })
        .map_err(mlua_to_nota)?;
    t.set("status", status).map_err(mlua_to_nota)?;

    let ctx2 = ctx.clone();
    let diff = lua
        .create_function(move |lua, staged: Option<bool>| -> mlua::Result<Table> {
            let cwd = match working_dir(&ctx2) {
                Ok(cwd) => cwd,
                Err(msg) => return each_has_work_left_directory_result(lua, "text", msg),
            };
            let mut argv = vec!["diff", "--no-color"];
            if staged.unwrap_or(false) {
                argv.push("--cached");
            }
            let out = run_git(&cwd, &argv).map_err(lua_err)?;
            let result = lua.create_table()?;
            result.set("code", out.code)?;
            result.set("text", out.stdout)?;
            result.set("stderr", out.stderr)?;
            Ok(result)
        })
        .map_err(mlua_to_nota)?;
    t.set("diff", diff).map_err(mlua_to_nota)?;

    let ctx2 = ctx.clone();
    let repo_root = lua
        .create_function(move |_, ()| {
            let Ok(cwd) = working_dir(&ctx2) else {
                return Ok(None);
            };
            let out = run_git(&cwd, &["rev-parse", "--show-toplevel"]).map_err(lua_err)?;
            if out.code != 0 {
                return Ok(None);
            }
            Ok(Some(out.stdout.trim().to_owned()))
        })
        .map_err(mlua_to_nota)?;
    t.set("repo_root", repo_root).map_err(mlua_to_nota)?;

    Ok(t)
}

fn each_has_work_left_directory_result(
    lua: &Lua,
    text_key: &str,
    msg: String,
) -> mlua::Result<Table> {
    let result = lua.create_table()?;
    result.set("code", -1)?;
    result.set(text_key, "")?;
    result.set("stderr", msg)?;
    result.set("ok", false)?;
    Ok(result)
}

#[derive(Debug)]
struct GitOutput {
    code: i32,
    stdout: String,
    stderr: String,
}

fn run_git<S: AsRef<str>>(cwd: &PathBuf, argv: &[S]) -> NotaResult<GitOutput> {
    for arg in argv {
        let arg = arg.as_ref();
        if ENTER_ONLY_ARGS.contains(&arg) {
            return Err(NotaError::other(format!(
                "nota.git does not accept `{arg}` because it redirects operations outside the workspace"
            )));
        }

        if let Some((head, _)) = arg.split_once('=') {
            if ENTER_ONLY_ARGS.contains(&head) {
                return Err(NotaError::other(format!(
                    "nota.git does not accept `{head}=...` because it redirects operations outside the workspace"
                )));
            }
        }
    }

    let out = crate::proc::background_command("git")
        .args(["-c", "core.quotePath=false"])
        .args(argv.iter().map(|a| a.as_ref()))
        .current_dir(cwd)
        .env("GIT_TERMINAL_PROMPT", "0")
        .env("GIT_PAGER", "cat")
        .env("GIT_EDITOR", "true")
        .output()
        .map_err(|e| {
            if e.kind() == std::io::ErrorKind::NotFound {
                NotaError::other("The `git` command was not found; install Git first")
            } else {
                NotaError::other(format!("Could not start Git: {e}"))
            }
        })?;

    Ok(GitOutput {
        code: out.status.code().unwrap_or(-1),
        stdout: String::from_utf8_lossy(&out.stdout).into_owned(),
        stderr: String::from_utf8_lossy(&out.stderr).into_owned(),
    })
}

fn working_dir(ctx: &HostContext) -> Result<PathBuf, String> {
    let workspace = ctx.workspace.lock().unwrap().clone();
    let doc_dir = ctx
        .documents
        .lock()
        .unwrap()
        .active()
        .and_then(|d| d.path.as_ref())
        .and_then(|p| p.parent())
        .map(|p| p.to_path_buf());
    item_work_left_directory(workspace, doc_dir)
}

fn item_work_left_directory(
    workspace: Option<PathBuf>,
    doc_dir: Option<PathBuf>,
) -> Result<PathBuf, String> {
    workspace.or(doc_dir).ok_or_else(|| {
        "Cannot determine a Git directory because there is no workspace and the document has not been saved".to_owned()
    })
}

fn table_to_argv(args: &Table) -> mlua::Result<Vec<String>> {
    let mut out = Vec::new();
    for pair in args.clone().sequence_values::<Value>() {
        match pair? {
            Value::String(s) => out.push(s.to_string_lossy().to_string()),
            other => {
                return Err(mlua::Error::RuntimeError(format!(
                    "nota.git.run arguments must be strings, received {}",
                    other.type_name()
                )))
            }
        }
    }
    Ok(out)
}

#[derive(Debug, PartialEq)]
struct ChangedEntry {
    index: String,

    work: String,
    path: String,

    orig: Option<String>,

    state: &'static str,
}

fn parse_status_2(raw: &str) -> (String, Vec<ChangedEntry>) {
    let parts: Vec<&str> = raw.split('\0').collect();

    let mut i = 0;
    let mut branch = String::new();

    if let Some(first) = parts.first() {
        if let Some(rest) = first.strip_prefix("##") {
            branch = rest.trim_start().to_owned();
            i = 1;
        }
    }

    let mut out = Vec::new();
    while i < parts.len() {
        let line = parts[i];

        if line.is_empty() {
            i += 1;
            continue;
        }

        let index = line.get(0..1).unwrap_or(" ").to_owned();
        let work = line.get(1..2).unwrap_or(" ").to_owned();
        let path = line.get(3..).unwrap_or("").to_owned();
        let st = format!("{index}{work}");

        let mut orig = None;
        if st.contains('R') || st.contains('C') {
            orig = parts.get(i + 1).map(|s| (*s).to_owned());
            i += 2;
        } else {
            i += 1;
        }

        out.push(ChangedEntry {
            state: normalize_kind(&index, &work),
            index,
            work,
            path,
            orig,
        });
    }

    (branch, out)
}

fn normalize_kind(index: &str, work: &str) -> &'static str {
    if index == "?" && work == "?" {
        "untracked"
    } else if index != " " && work != " " {
        "staged-dirty"
    } else if index != " " {
        "staged"
    } else {
        "modified"
    }
}

const IMAGE_IS: &str = "--format=%x1f%h%x1f%p%x1f%d%x1f%s";

#[derive(Debug, PartialEq)]
struct GraphEntry {
    art: String,

    hash: Option<String>,

    parent: String,

    refs: String,
    subject: String,
}

fn parse_image_date_only(stdout: &str) -> Vec<GraphEntry> {
    let mut out = Vec::new();
    for line in stdout.split('\n') {
        if line.is_empty() {
            continue;
        }
        let parts: Vec<&str> = line.split('\u{1f}').collect();

        let hash = parts.get(1).copied().unwrap_or("");
        if parts.len() < 5 || hash.is_empty() {
            out.push(GraphEntry {
                art: line.to_owned(),
                hash: None,
                parent: String::new(),
                refs: String::new(),
                subject: String::new(),
            });
            continue;
        }
        out.push(GraphEntry {
            art: parts[0].to_owned(),
            hash: Some(hash.to_owned()),
            parent: parts[2].split_whitespace().next().unwrap_or("").to_owned(),
            refs: parts[3]
                .trim()
                .trim_start_matches('(')
                .trim_end_matches(')')
                .trim()
                .to_owned(),
            subject: parts[4].to_owned(),
        });
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    fn passive_position_panel_sentence(r: &NotaResult<GitOutput>) -> bool {
        matches!(r, Err(e) if e.to_string().contains("does not accept"))
    }

    #[test]
    fn middle_define_item_target_directory_args_need_sentence() {
        let cwd = std::env::temp_dir();
        let r = run_git(&cwd, &["-C", "/tmp", "status"]);
        assert!(
            passive_position_panel_sentence(&r),
            "`-C` \u{5e94}\u{5f53}\u{88ab}\u{56f4}\u{680f}\u{62d2}\u{6389}"
        );
    }

    #[test]
    fn wait_number_write_method_middle_define_item_same_sample_need_sentence() {
        let cwd = std::env::temp_dir();
        assert!(passive_position_panel_sentence(&run_git(
            &cwd,
            &["--git-dir=/tmp/x", "status"]
        )));
        assert!(passive_position_panel_sentence(&run_git(
            &cwd,
            &["--work-tree=/tmp/x", "status"]
        )));
    }

    #[test]
    fn plain_same_args_not_change_passive_position_panel_none_upper() {
        let cwd = std::env::temp_dir();
        let r = run_git(&cwd, &["status", "--porcelain=v1"]);
        assert!(!passive_position_panel_sentence(&r), "\u{666e}\u{901a}\u{53c2}\u{6570}\u{88ab}\u{56f4}\u{680f}\u{8bef}\u{4f24}\u{4e86}\u{ff1a}{r:?}");
    }

    #[test]
    fn start_workspace_old_use_workspace() {
        let got = item_work_left_directory(
            Some(PathBuf::from("/\u{5de5}\u{4f5c}\u{533a}")),
            Some(PathBuf::from("/\u{6587}\u{7a3f}")),
        );
        assert_eq!(got.unwrap(), PathBuf::from("/\u{5de5}\u{4f5c}\u{533a}"));
    }

    #[test]
    fn each_workspace_old_derive_to_document_lock_at_directory() {
        let got = item_work_left_directory(None, Some(PathBuf::from("/\u{6587}\u{7a3f}")));
        assert_eq!(got.unwrap(), PathBuf::from("/\u{6587}\u{7a3f}"));
    }

    #[test]
    fn two_all_each_has_is_replace_static_not_sentence_passive_not_is_plugin_broken() {
        let err = item_work_left_directory(None, None).unwrap_err();
        assert!(
            err.contains("Cannot determine a Git directory"),
            "unexpected error: {err}"
        );
    }

    fn status_2(segment: &[&str]) -> String {
        segment.join("\0")
    }

    #[test]
    fn empty_data_out_is_empty_list_table_two_not_is_one_sentence_package_error() {
        assert_eq!(parse_status_2(""), (String::new(), Vec::new()));
    }

    #[test]
    fn part_only_line_link_upper_has_and_ahead_one_start_that_out_incoming() {
        let (branch, entries) = parse_status_2(&status_2(&["## main...origin/main [ahead 1]"]));
        assert_eq!(branch, "main...origin/main [ahead 1]");
        assert!(entries.is_empty());
    }

    #[test]
    fn each_has_part_only_segment_is_base_one_item_change_not_can_passive_hold_drop() {
        let (branch, entries) = parse_status_2(&status_2(&[" M \u{7532}.md", "?? \u{4e59}.md"]));
        assert_eq!(branch, "");
        assert_eq!(entries.len(), 2);
        assert_eq!(entries[0].path, "\u{7532}.md");
    }

    #[test]
    fn middle_text_path_source_sample_out_incoming() {
        let (_, entries) = parse_status_2(&status_2(&[
            "## main",
            " M \u{4e2d}\u{6587} \u{6587}\u{4ef6}\u{540d}.md",
        ]));
        assert_eq!(
            entries[0].path,
            "\u{4e2d}\u{6587} \u{6587}\u{4ef6}\u{540d}.md"
        );
    }

    #[test]
    fn four_middle_status_character_normalize_pair_kind() {
        let (_, e) = parse_status_2(&status_2(&[
            "## main",
            "?? \u{65b0}.md",
            "M  a.md",
            "MM b.md",
            " M c.md",
        ]));
        let got: Vec<&str> = e.iter().map(|x| x.state).collect();
        assert_eq!(got, ["untracked", "staged", "staged-dirty", "modified"]);
    }

    #[test]
    fn middle_name_name_need_multiple_hold_drop_one_segment_source_path() {
        let (_, e) = parse_status_2(&status_2(&["## main", "R  b.md", "a.md", " M c.md"]));
        assert_eq!(e.len(), 2);
        assert_eq!(e[0].path, "b.md");
        assert_eq!(e[0].orig.as_deref(), Some("a.md"));
        assert_eq!(e[1].path, "c.md");
        assert_eq!(e[1].orig, None, "\u{4e0d}\u{662f}\u{91cd}\u{547d}\u{540d}\u{7684}\u{4e0d}\u{8be5}\u{6709}\u{539f}\u{8def}\u{5f84}");
    }

    #[test]

    fn service_only_c_page_compute_multiple_one_segment() {
        let (_, e) = parse_status_2(&status_2(&["## main", "C  b.md", "a.md"]));
        assert_eq!(e.len(), 1);
        assert_eq!(e[0].orig.as_deref(), Some("a.md"));
    }

    #[test]
    fn item_target_few_one_segment_page_not_return_click() {
        let (_, e) = parse_status_2(&status_2(&["## main", "R  b.md"]));
        assert_eq!(e.len(), 1);
        assert_eq!(e[0].orig, None);
    }

    const GRAPH_SAMPLE: &str = concat!(
        "*   \u{1f}f40c61c\u{1f}d9d8ce9 1583864\u{1f} (HEAD -> main)\u{1f}\u{5408}\u{5e76}\u{652f}\u{7ebf}\n",
        "|\\  \n",
        "* | \u{1f}d9d8ce9\u{1f}a2def45\u{1f}\u{1f}\u{4e3b}\u{7ebf}\u{5f80}\u{524d}\u{8d70}\n",
        "| * \u{1f}1583864\u{1f}32b98f1\u{1f} (\u{652f}\u{7ebf})\u{1f}\u{652f}\u{7ebf}\u{4e0a}\u{518d}\u{6539}\u{4e00}\u{5904}\n",
        "| * \u{1f}32b98f1\u{1f}a2def45\u{1f}\u{1f}\u{652f}\u{7ebf}\u{4e0a}\u{52a0}\u{4e00}\u{4efd} b.md\n",
        "|/  \n",
        "* \u{1f}a2def45\u{1f}0a703e9\u{1f}\u{1f}\u{8865}\u{4e00}\u{6bb5}\n",
        "* \u{1f}0a703e9\u{1f}\u{1f}\u{1f}\u{7b2c}\u{4e00}\u{7248}\u{ff1a}a.md\n",
    );

    #[test]
    fn image_date_only_cut_out_image_thread_and_character_segment() {
        let rows = parse_image_date_only(GRAPH_SAMPLE);
        assert_eq!(
            rows.len(),
            8,
            "6 \u{4e2a}\u{63d0}\u{4ea4} + 2 \u{6761}\u{8fde}\u{63a5}\u{7ebf}"
        );

        let first = &rows[0];
        assert_eq!(first.art, "*   ", "\u{56fe}\u{7ebf}\u{4e0a}\u{7684}\u{5bf9}\u{9f50}\u{7a7a}\u{683c}\u{8981}\u{539f}\u{6837}\u{7559}\u{4f4f}");
        assert_eq!(first.hash.as_deref(), Some("f40c61c"));
        assert_eq!(first.parent, "d9d8ce9", "\u{5408}\u{5e76}\u{63d0}\u{4ea4}\u{53ea}\u{53d6}**\u{7b2c}\u{4e00}\u{4e2a}**\u{7236}\u{ff08}\u{4e3b}\u{5e72}\u{90a3}\u{4fa7}\u{ff09}");
        assert_eq!(first.refs, "HEAD -> main", "\u{4e24}\u{5934}\u{7684}\u{62ec}\u{53f7}\u{548c}\u{7a7a}\u{683c}\u{8981}\u{53bb}\u{6389}");
        assert_eq!(first.subject, "\u{5408}\u{5e76}\u{652f}\u{7ebf}");
    }

    #[test]
    fn pure_link_boundary_thread_line_each_has_question_call_single_image_thread_stream() {
        let rows = parse_image_date_only(GRAPH_SAMPLE);
        assert_eq!(rows[1].hash, None);
        assert_eq!(rows[1].art, "|\\  ");
        assert_eq!(rows[5].hash, None);
        assert_eq!(rows[5].art, "|/  ");
    }

    #[test]
    fn root_question_call_service_is_empty_stream_two_not_is_missing_character_segment() {
        let rows = parse_image_date_only(GRAPH_SAMPLE);
        let root = &rows[7];
        assert_eq!(root.hash.as_deref(), Some("0a703e9"));
        assert_eq!(root.parent, "");
        assert_eq!(root.refs, "");
    }

    #[test]
    fn each_has_part_only_table_before_question_call_refs_is_empty_stream() {
        let rows = parse_image_date_only(GRAPH_SAMPLE);
        assert_eq!(rows[2].refs, "");
        assert_eq!(rows[2].subject, "\u{4e3b}\u{7ebf}\u{5f80}\u{524d}\u{8d70}");
        assert_eq!(rows[3].refs, "\u{652f}\u{7ebf}");
    }

    #[test]
    fn empty_data_out_and_position_follow_replace_line_all_not_return_multiple_out_one_line() {
        assert!(parse_image_date_only("").is_empty());
        assert_eq!(
            parse_image_date_only("* \u{1f}abc\u{1f}\u{1f}\u{1f}\u{6807}\u{9898}\n").len(),
            1
        );
    }
}
