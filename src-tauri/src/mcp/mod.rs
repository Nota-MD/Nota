//! Internal document tools shared with the authenticated developer bridge.
//!
//! The former stdio MCP server and single-instance transport were removed.
//! Only the tested host abstraction and document operations remain.

pub mod host;
pub mod tools;

pub const MCP_PROTOCOL_VERSIONS: &[&str] = &["2025-06-18", "2025-03-26", "2024-11-05"];
