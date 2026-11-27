use serde_json::Value;

pub fn validate_input_play(params: &Value) -> std::result::Result<(), String> {
    let actions = params
        .get("actions")
        .and_then(Value::as_array)
        .ok_or_else(|| "input.play requires an actions array".to_string())?;
    if actions.is_empty() || actions.len() > 10_000 {
        return Err("input.play accepts between 1 and 10000 actions".to_string());
    }
    let mut text_size = 0_usize;
    for action in actions {
        let kind = action
            .get("type")
            .and_then(Value::as_str)
            .ok_or_else(|| "Every input action requires a type".to_string())?;
        match kind {
            "text" => {
                let text = action
                    .get("text")
                    .and_then(Value::as_str)
                    .ok_or_else(|| "text actions require text".to_string())?;
                text_size = text_size.saturating_add(text.len());
            }
            "key" | "shortcut" | "wait" | "focus" | "click" | "command" => {}
            other => return Err(format!("Unknown input action type: {other}")),
        }
    }
    if text_size > 1_000_000 {
        return Err("input.play text exceeds 1000000 bytes".to_string());
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::validate_input_play;
    use serde_json::json;

    #[test]
    fn accepts_supported_actions() {
        let params = json!({
            "actions": [
                {"type": "focus"},
                {"type": "text", "text": "# Nota"},
                {"type": "key", "key": "Enter"},
                {"type": "shortcut", "keys": "Ctrl+B"},
                {"type": "wait", "ms": 50},
                {"type": "click", "selector": ".menu"},
                {"type": "command", "name": "h1"}
            ]
        });
        assert!(validate_input_play(&params).is_ok());
    }

    #[test]
    fn rejects_empty_unknown_and_oversized_scripts() {
        assert!(validate_input_play(&json!({"actions": []})).is_err());
        assert!(validate_input_play(&json!({
            "actions": [{"type": "unknown"}]
        }))
        .is_err());
        assert!(validate_input_play(&json!({
            "actions": [{"type": "text", "text": "x".repeat(1_000_001)}]
        }))
        .is_err());
    }
}
