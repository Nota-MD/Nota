use mlua::{Lua, Table, Value};

use super::{json_to_lua, mlua_to_nota};
use crate::error::Result as NotaResult;

pub fn build(lua: &Lua) -> NotaResult<Table> {
    let t = lua.create_table().map_err(mlua_to_nota)?;

    let decode = lua
        .create_function(|lua, text: String| {
            let mut results = mlua::MultiValue::new();
            match serde_json::from_str::<serde_json::Value>(&text) {
                Ok(value) => results.push_back(json_to_lua(lua, &value)?),
                Err(e) => {
                    results.push_back(Value::Nil);
                    let reason = lua.create_string(format!("Invalid JSON: {e}"))?;
                    results.push_back(Value::String(reason));
                }
            }
            Ok(results)
        })
        .map_err(mlua_to_nota)?;
    t.set("decode", decode).map_err(mlua_to_nota)?;

    Ok(t)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn decoded_shape_matches_the_http_api() {
        let lua = Lua::new();
        let json = build(&lua).unwrap();
        let decode = json.get::<mlua::Function>("decode").unwrap();

        let (value, error) = decode
            .call::<(Value, Value)>(
                "{\"choices\":[{\"message\":{\"content\":\"\u{4f60}\u{597d}\"}}]}",
            )
            .unwrap();
        assert!(
            matches!(error, Value::Nil),
            "successful decoding must not return an error"
        );
        let value = match value {
            Value::Table(t) => t,
            other => panic!("expected a table, got {other:?}"),
        };
        let choices = value.get::<Table>("choices").unwrap();

        assert_eq!(choices.raw_len(), 1);
        assert_eq!(
            choices
                .get::<Table>(1)
                .unwrap()
                .get::<Table>("message")
                .unwrap()
                .get::<String>("content")
                .unwrap(),
            "\u{4f60}\u{597d}"
        );
    }

    #[test]
    fn invalid_json_returns_nil_and_a_reason() {
        let lua = Lua::new();
        let json = build(&lua).unwrap();
        let decode = json.get::<mlua::Function>("decode").unwrap();

        for invalid in ["", "{", "{\"a\":}", "data: [DONE]"] {
            let (value, error) = decode.call::<(Value, Value)>(invalid).unwrap();
            assert!(
                matches!(value, Value::Nil),
                "invalid JSON produced a value: {invalid}"
            );
            match error {
                Value::String(s) => assert!(!s.to_str().unwrap().is_empty()),
                other => panic!("expected an error string, got {other:?}"),
            }
        }
    }

    #[test]
    fn non_string_values_follow_the_expected_api_contract() {
        let lua = Lua::new();
        let json = build(&lua).unwrap();
        let decode = json.get::<mlua::Function>("decode").unwrap();

        assert!(
            decode.call::<Value>(lua.create_table().unwrap()).is_err(),
            "tables are not JSON text"
        );
        assert!(
            decode.call::<Value>(true).is_err(),
            "booleans are not JSON text"
        );

        let (value, error) = decode.call::<(Value, Value)>(1).unwrap();
        assert!(matches!(error, Value::Nil));
        assert!(
            matches!(value, Value::Integer(1)),
            "unexpected value: {value:?}"
        );
    }

    #[test]
    fn top_level_null_returns_a_single_nil() {
        let lua = Lua::new();
        let json = build(&lua).unwrap();
        let decode = json.get::<mlua::Function>("decode").unwrap();

        let count = decode
            .call::<mlua::MultiValue>("null")
            .unwrap()
            .into_iter()
            .count();
        assert_eq!(
            count, 1,
            "top-level null must decode to one nil, not nil plus a reason"
        );
    }
}
