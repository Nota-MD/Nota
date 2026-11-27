mod generated {
    include!(concat!(env!("OUT_DIR"), "/distribution_profile.rs"));
}

pub use generated::*;

pub fn is_official() -> bool {
    KIND == "official"
}

pub fn has_updates() -> bool {
    UPDATE_MANIFEST_URL.is_some() && UPDATE_RELEASE_PREFIX.is_some()
}
