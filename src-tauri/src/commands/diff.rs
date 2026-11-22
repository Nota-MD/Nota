#[tauri::command]
pub fn nota_diff_texts(
    before: String,
    after: String,
    context: Option<usize>,
) -> Vec<crate::diff::DiffLine> {
    crate::diff::unified_diff_2(
        &before,
        &after,
        context.unwrap_or(crate::lua::api::diff::DEFAULT_CONTEXT),
    )
}
