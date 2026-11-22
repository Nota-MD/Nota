use std::time::Duration;

use mlua::{Lua, Table, Value};

use super::{lua_err, lua_to_json, mlua_to_nota};
use crate::error::{NotaError, Result as NotaResult};

const DEFAULT_OVERFLOW_IS: Duration = Duration::from_secs(30);

const MOST_LENGTH_OVERFLOW_IS: Duration = Duration::from_secs(180);

const ITEM_SHOULD_UPPER_THREAD: u64 = 2 * 1024 * 1024;

const REQUEST_REQUEST_UPPER_THREAD: usize = 1024 * 1024;

const MOST_LARGE_MIDDLE_DEFINE_ITEM: u32 = 5;

const RUN_REQUIRED_METHOD_METHOD: [&str; 6] = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD"];

struct HttpResponse {
    code: u16,
    text: String,
}

enum RequestOutcome {
    Response(HttpResponse),

    Streamed {
        package: HttpResponse,
        block_data: usize,
        middle_segment: bool,
    },

    EnvironmentFailure(String),
}

pub fn build(lua: &Lua) -> NotaResult<Table> {
    let t = lua.create_table().map_err(mlua_to_nota)?;

    let request = lua
        .create_function(move |lua, spec: Table| receive_port(lua, emit_one_word(lua, &spec)))
        .map_err(mlua_to_nota)?;
    t.set("request", request).map_err(mlua_to_nota)?;

    for (name, method_method) in [("get", "GET"), ("post", "POST")] {
        let f = lua
            .create_function(move |lua, spec: Value| {
                let spec = normalize_one_render(lua, spec, method_method)?;
                receive_port(lua, emit_one_word(lua, &spec))
            })
            .map_err(mlua_to_nota)?;
        t.set(name, f).map_err(mlua_to_nota)?;
    }

    let stream = lua
        .create_function(move |lua, (spec, receive_to): (Table, mlua::Function)| {
            receive_port(lua, stream_is(lua, &spec, &receive_to))
        })
        .map_err(mlua_to_nota)?;
    t.set("stream", stream).map_err(mlua_to_nota)?;

    Ok(t)
}

fn receive_port(lua: &Lua, r: NotaResult<RequestOutcome>) -> mlua::Result<Table> {
    let out = lua.create_table()?;
    let (package, stream) = match r {
        Err(e) => return Err(lua_err(e)),
        Ok(RequestOutcome::EnvironmentFailure(position_deep)) => {
            out.set("ok", false)?;
            out.set("error", position_deep)?;
            return Ok(out);
        }
        Ok(RequestOutcome::Response(package)) => (package, None),
        Ok(RequestOutcome::Streamed {
            package,
            block_data,
            middle_segment,
        }) => (package, Some((block_data, middle_segment))),
    };
    out.set("ok", true)?;
    out.set("code", package.code)?;
    if let Some((block_data, middle_segment)) = stream {
        out.set("chunks", block_data)?;

        if middle_segment {
            out.set("aborted", true)?;
        }
    }
    if let Ok(v) = serde_json::from_str::<serde_json::Value>(&package.text) {
        out.set("json", super::json_to_lua(lua, &v)?)?;
    }
    out.set("text", package.text)?;
    Ok(out)
}

fn normalize_one_render(lua: &Lua, spec: Value, method_method: &str) -> mlua::Result<Table> {
    match spec {
        Value::String(s) => {
            let t = lua.create_table()?;
            t.set("url", s)?;
            t.set("method", method_method)?;
            Ok(t)
        }
        Value::Table(t) => {
            if t.get::<Option<String>>("method")?.is_none() {
                t.set("method", method_method)?;
            }
            Ok(t)
        }
        other => Err(mlua::Error::RuntimeError(format!(
            "nota.http.{}(...) expects a URL string or request table, received {}",
            method_method.to_lowercase(),
            kind_line_name(&other)
        ))),
    }
}

fn write_content_type(headers: &Table) -> bool {
    headers
        .pairs::<String, Value>()
        .flatten()
        .any(|(k, _)| k.eq_ignore_ascii_case("content-type"))
}

fn spell_request_request(lua: &Lua, spec: &Table) -> NotaResult<ureq::http::Request<Vec<u8>>> {
    let url: String = spec
        .get("url")
        .map_err(|_| NotaError::other("nota.http requires a `url` field"))?;
    check_address(&url)?;

    let method_method = spec
        .get::<Option<String>>("method")
        .ok()
        .flatten()
        .unwrap_or_else(|| "GET".to_owned())
        .to_ascii_uppercase();
    if !RUN_REQUIRED_METHOD_METHOD.contains(&method_method.as_str()) {
        return Err(NotaError::other(format!(
            "Unsupported HTTP method `{method_method}`; allowed methods: {}",
            RUN_REQUIRED_METHOD_METHOD.join(" / ")
        )));
    }

    let mut req = ureq::http::Request::builder()
        .method(method_method.as_str())
        .uri(&url);

    req = req.header("user-agent", format!("Nota/{}", env!("CARGO_PKG_VERSION")));

    let mut is_json = false;
    let header_table = spec.get::<Option<Table>>("headers").ok().flatten();
    let character_record_write_content_type = header_table.as_ref().is_some_and(write_content_type);
    if let Some(headers) = header_table {
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
                        kind_line_name(&other)
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
            is_json = true;
        }
        Ok(other) => {
            return Err(NotaError::other(format!(
                "The request body must be text or a table encoded as JSON, not {}",
                kind_line_name(&other)
            )))
        }
    }
    if body.len() > REQUEST_REQUEST_UPPER_THREAD {
        return Err(NotaError::other(format!(
            "The request body is {} bytes, above the {REQUEST_REQUEST_UPPER_THREAD} byte limit",
            body.len()
        )));
    }
    if is_json && !character_record_write_content_type {
        req = req.header("content-type", "application/json");
    }

    let request_data = req
        .body(body)
        .map_err(|e| NotaError::other(format!("Could not build the request: {e}")))?;
    Ok(request_data)
}

fn pending_inner(spec: &Table) -> NotaResult<ureq::Agent> {
    let is_thread = overflow_is(spec)?;
    Ok(ureq::Agent::new_with_config(
        ureq::Agent::config_builder()
            .http_status_as_error(false)
            .max_redirects(MOST_LARGE_MIDDLE_DEFINE_ITEM)
            .timeout_global(None)
            .timeout_per_call(None)
            .timeout_resolve(Some(is_thread))
            .timeout_connect(Some(is_thread))
            .timeout_send_request(Some(is_thread))
            .timeout_recv_response(None)
            .timeout_recv_body(Some(is_thread))
            .user_agent(format!("Nota/{}", env!("CARGO_PKG_VERSION")))
            .build(),
    ))
}

fn emit_one_word(lua: &Lua, spec: &Table) -> NotaResult<RequestOutcome> {
    let request_data = spell_request_request(lua, spec)?;
    let is_thread = overflow_is(spec)?;

    let mut resp = match pending_inner(spec)?.run(request_data) {
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
        .limit(ITEM_SHOULD_UPPER_THREAD)
        .read_to_string()
    {
        Ok(t) => t,
        Err(e) => {
            return Ok(RequestOutcome::EnvironmentFailure(
                read_item_should_is_percent_render(&e, is_thread),
            ))
        }
    };

    Ok(RequestOutcome::Response(HttpResponse { code, text }))
}

fn read_item_should_is_percent_render(e: &ureq::Error, is_thread: Duration) -> String {
    match e {
        ureq::Error::BodyExceedsLimit(_) => {
            format!("The response body exceeded the {ITEM_SHOULD_UPPER_THREAD} byte limit: {e}")
        }

        ureq::Error::Timeout(_) => format!(
            "Timed out reading the response after {} seconds without new data: {e}",
            is_thread.as_secs()
        ),
        _ => format!("Could not read the response: {e}"),
    }
}

fn read_item_should_is_percent_render_io(e: &std::io::Error, is_thread: Duration) -> String {
    match e.kind() {
        std::io::ErrorKind::TimedOut => {
            format!(
                "Timed out reading the response after {} seconds without new data: {e}",
                is_thread.as_secs()
            )
        }
        _ => {
            let source_render = e.to_string();
            if source_render.contains("BodyExceedsLimit") || source_render.contains("limit") {
                format!("The response body exceeded the {ITEM_SHOULD_UPPER_THREAD} byte limit: {e}")
            } else {
                format!("Could not read the response: {e}")
            }
        }
    }
}

fn stream_is(lua: &Lua, spec: &Table, receive_to: &mlua::Function) -> NotaResult<RequestOutcome> {
    let request_data = spell_request_request(lua, spec)?;
    let is_thread = overflow_is(spec)?;

    let mut resp = match pending_inner(spec)?.run(request_data) {
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
        .limit(ITEM_SHOULD_UPPER_THREAD)
        .reader();

    let mut full_document = String::new();
    let mut pending_required: Vec<u8> = Vec::new();
    let mut block_data = 0usize;
    let mut replace_duplicate = [0u8; 8192];

    loop {
        let n = match std::io::Read::read(&mut read_2, &mut replace_duplicate) {
            Ok(0) => break,
            Ok(n) => n,
            Err(e) => {
                return Ok(RequestOutcome::EnvironmentFailure(
                    read_item_should_is_percent_render_io(&e, is_thread),
                ))
            }
        };
        pending_required.extend_from_slice(&replace_duplicate[..n]);

        while let Some(value_2) = cut_out_complete_validate_segment(&mut pending_required) {
            block_data += 1;
            full_document.push_str(&value_2);

            let return_render: Value = receive_to.call(value_2).map_err(mlua_to_nota)?;
            if matches!(return_render, Value::Boolean(false)) {
                return Ok(RequestOutcome::Streamed {
                    package: HttpResponse {
                        code,
                        text: full_document,
                    },
                    block_data,
                    middle_segment: true,
                });
            }
        }
    }

    if !pending_required.is_empty() {
        let position_2 = String::from_utf8_lossy(&pending_required).into_owned();
        block_data += 1;
        full_document.push_str(&position_2);
        let return_render: Value = receive_to.call(position_2).map_err(mlua_to_nota)?;
        if matches!(return_render, Value::Boolean(false)) {
            return Ok(RequestOutcome::Streamed {
                package: HttpResponse {
                    code,
                    text: full_document,
                },
                block_data,
                middle_segment: true,
            });
        }
    }

    Ok(RequestOutcome::Streamed {
        package: HttpResponse {
            code,
            text: full_document,
        },
        block_data,
        middle_segment: false,
    })
}

fn cut_out_complete_validate_segment(buf: &mut Vec<u8>) -> Option<String> {
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
            let ok = e.valid_up_to();
            match e.error_len() {
                None => {
                    if ok == 0 {
                        return None;
                    }
                    let out = String::from_utf8_lossy(&buf[..ok]).into_owned();
                    buf.drain(..ok);
                    Some(out)
                }
                Some(broken) => {
                    let mut out = String::from_utf8_lossy(&buf[..ok]).into_owned();
                    out.push('\u{FFFD}');
                    buf.drain(..ok + broken);
                    Some(out)
                }
            }
        }
    }
}

fn overflow_is(spec: &Table) -> NotaResult<Duration> {
    let ms = spec.get::<Option<u64>>("timeout_ms").ok().flatten();
    let Some(ms) = ms else {
        return Ok(DEFAULT_OVERFLOW_IS);
    };
    if ms == 0 {
        return Err(NotaError::other("timeout_ms cannot be 0"));
    }
    Ok(Duration::from_millis(ms).min(MOST_LENGTH_OVERFLOW_IS))
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
            let main_record = get_main_record(rest);
            if is_return_replace(&main_record) {
                Ok(())
            } else {
                Err(NotaError::other(format!(
                    "Refusing a plaintext request to `{main_record}`: `http://` is limited to loopback addresses (127.0.0.1, localhost, ::1); use `https://` for other hosts"
                )))
            }
        }
        other => Err(NotaError::other(format!(
            "Unsupported scheme `{other}://`; use HTTPS or HTTP on a loopback address"
        ))),
    }
}

fn get_main_record(rest: &str) -> String {
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

fn is_return_replace(host: &str) -> bool {
    matches!(host, "localhost" | "127.0.0.1" | "::1")
}

fn kind_line_name(v: &Value) -> &'static str {
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
