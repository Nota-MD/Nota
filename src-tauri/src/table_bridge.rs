//! Narrow bridge between the active GFM table and table-capable extensions.
//!
//! The editor owns the document. Extensions receive a snapshot, may supply a
//! temporary display map, and may request one undoable multi-cell edit. Nothing
//! in this module writes Markdown directly.

use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TablePoint {
    pub row: usize,
    pub column: usize,
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TableRange {
    pub top: usize,
    pub left: usize,
    pub bottom: usize,
    pub right: usize,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TableSnapshot {
    pub document_id: u64,
    pub table_id: String,
    pub rows: Vec<Vec<String>>,
    pub selection: TableRange,
    pub active: TablePoint,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TableRender {
    pub plugin: String,
    pub document_id: u64,
    pub table_id: String,
    pub extension_content: bool,
    pub cells: BTreeMap<String, String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TableCellUpdate {
    pub row: usize,
    pub column: usize,
    pub text: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TableWriteRequest {
    pub plugin: String,
    pub document_id: u64,
    pub table_id: String,
    pub cells: Vec<TableCellUpdate>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TableAction {
    pub plugin: String,
    pub id: String,
    pub label: String,
    pub command: String,
}

#[derive(Default)]
pub struct TableBridge {
    snapshot: Option<TableSnapshot>,
    renders: BTreeMap<String, TableRender>,
    actions: BTreeMap<String, TableAction>,
}

impl TableBridge {
    pub fn snapshot(&self) -> Option<TableSnapshot> {
        self.snapshot.clone()
    }

    pub fn sync_snapshot(&mut self, snapshot: Option<TableSnapshot>) {
        let same_document = self
            .snapshot
            .as_ref()
            .zip(snapshot.as_ref())
            .is_some_and(|(old, new)| old.document_id == new.document_id);
        self.snapshot = snapshot;
        if !same_document {
            self.renders.clear();
        }
    }

    pub fn render(&mut self, plugin: &str, cells: BTreeMap<String, String>) -> Option<TableRender> {
        let snapshot = self.snapshot.as_ref()?;
        let render = TableRender {
            plugin: plugin.to_owned(),
            document_id: snapshot.document_id,
            table_id: snapshot.table_id.clone(),
            extension_content: !cells.is_empty(),
            cells,
        };
        self.renders.insert(
            format!("{}:{}", render.plugin, render.table_id),
            render.clone(),
        );
        Some(render)
    }

    pub fn write_request(
        &self,
        plugin: &str,
        cells: Vec<TableCellUpdate>,
    ) -> Option<TableWriteRequest> {
        let snapshot = self.snapshot.as_ref()?;
        let rows = snapshot.rows.len();
        let columns = snapshot.rows.iter().map(Vec::len).max().unwrap_or(0);
        let cells: Vec<_> = cells
            .into_iter()
            .filter(|cell| cell.row < rows && cell.column < columns)
            .collect();
        if cells.is_empty() {
            return None;
        }
        Some(TableWriteRequest {
            plugin: plugin.to_owned(),
            document_id: snapshot.document_id,
            table_id: snapshot.table_id.clone(),
            cells,
        })
    }

    pub fn register_action(&mut self, action: TableAction) {
        self.actions
            .insert(format!("{}:{}", action.plugin, action.id), action);
    }

    pub fn actions(&self) -> Vec<TableAction> {
        self.actions.values().cloned().collect()
    }

    pub fn has_extension_content(&self) -> bool {
        self.renders.values().any(|render| render.extension_content)
    }

    pub fn renders(&self) -> Vec<TableRender> {
        self.renders.values().cloned().collect()
    }
}

pub fn parse_a1(reference: &str) -> Option<TablePoint> {
    let compact: String = reference.chars().filter(|c| *c != '$').collect();
    let digits = compact
        .char_indices()
        .find(|(_, c)| c.is_ascii_digit())
        .map(|(index, _)| index)?;
    let (letters, number) = compact.split_at(digits);
    if letters.is_empty() || number.is_empty() {
        return None;
    }
    let mut column = 0usize;
    for letter in letters.bytes() {
        if !letter.is_ascii_alphabetic() {
            return None;
        }
        column = column
            .checked_mul(26)?
            .checked_add(usize::from(letter.to_ascii_uppercase() - b'A' + 1))?;
    }
    let row = number.parse::<usize>().ok()?.checked_sub(1)?;
    Some(TablePoint {
        row,
        column: column.checked_sub(1)?,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_absolute_and_relative_references() {
        assert_eq!(parse_a1("$B$3"), Some(TablePoint { row: 2, column: 1 }));
        assert_eq!(parse_a1("AA10"), Some(TablePoint { row: 9, column: 26 }));
        assert_eq!(parse_a1("A0"), None);
        assert_eq!(parse_a1("3A"), None);
    }

    #[test]
    fn write_requests_stay_inside_the_snapshot() {
        let mut bridge = TableBridge::default();
        bridge.sync_snapshot(Some(TableSnapshot {
            document_id: 7,
            table_id: "table-1".to_owned(),
            rows: vec![vec!["A".into()], vec!["B".into()]],
            selection: TableRange::default(),
            active: TablePoint::default(),
        }));
        let request = bridge
            .write_request(
                "nota.test",
                vec![
                    TableCellUpdate {
                        row: 1,
                        column: 0,
                        text: "ok".into(),
                    },
                    TableCellUpdate {
                        row: 9,
                        column: 0,
                        text: "drop".into(),
                    },
                ],
            )
            .unwrap();
        assert_eq!(request.cells.len(), 1);
        assert_eq!(request.cells[0].text, "ok");
    }

    #[test]
    fn rendered_table_content_is_reported_to_the_host() {
        let mut bridge = TableBridge::default();
        bridge.sync_snapshot(Some(TableSnapshot {
            document_id: 7,
            table_id: "table-1".to_owned(),
            rows: vec![vec!["A".into()], vec!["=SUM(A1)".into()]],
            selection: TableRange::default(),
            active: TablePoint::default(),
        }));
        assert!(!bridge.has_extension_content());
        let mut cells = BTreeMap::new();
        cells.insert("B2".to_owned(), "ok".to_owned());
        let render = bridge.render("nota.test", cells).unwrap();
        assert!(render.extension_content);
        assert!(bridge.has_extension_content());
    }

    #[test]
    fn table_renders_survive_switching_tables_inside_one_document() {
        let mut bridge = TableBridge::default();
        bridge.sync_snapshot(Some(TableSnapshot {
            document_id: 7,
            table_id: "7:0".to_owned(),
            rows: vec![vec!["=SUM(A1)".into()]],
            selection: TableRange::default(),
            active: TablePoint::default(),
        }));
        let mut cells = BTreeMap::new();
        cells.insert("A1".to_owned(), "1".to_owned());
        bridge.render("nota.sheet-formulas", cells);

        bridge.sync_snapshot(Some(TableSnapshot {
            document_id: 7,
            table_id: "7:1".to_owned(),
            rows: vec![vec!["plain".into()]],
            selection: TableRange::default(),
            active: TablePoint::default(),
        }));
        let mut second_cells = BTreeMap::new();
        second_cells.insert("A1".to_owned(), "2".to_owned());
        bridge.render("nota.sheet-formulas", second_cells);
        assert!(bridge.has_extension_content());
        assert_eq!(
            bridge
                .renders()
                .iter()
                .map(|render| render.table_id.as_str())
                .collect::<Vec<_>>(),
            vec!["7:0", "7:1"]
        );

        bridge.sync_snapshot(Some(TableSnapshot {
            document_id: 8,
            table_id: "8:0".to_owned(),
            rows: vec![vec!["plain".into()]],
            selection: TableRange::default(),
            active: TablePoint::default(),
        }));
        assert!(!bridge.has_extension_content());
    }
}
