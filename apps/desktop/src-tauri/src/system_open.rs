//! System file managers/readers must use the host libraries, not the AppImage's GTK stack.
use std::{ffi::OsStr, process::Command};
pub(crate) fn command(program: impl AsRef<OsStr>) -> Command {
    let mut command = Command::new(program);
    if std::env::var_os("APPIMAGE").is_some() {
        clean_appimage_environment(&mut command);
    }
    command
}
fn clean_appimage_environment(command: &mut Command) {
    for name in [
        "APPIMAGE",
        "APPDIR",
        "LD_LIBRARY_PATH",
        "GTK_DATA_PREFIX",
        "GTK_EXE_PREFIX",
        "GTK_PATH",
        "GTK_IM_MODULE_FILE",
        "GI_TYPELIB_PATH",
        "GIO_MODULE_DIR",
        "GIO_EXTRA_MODULES",
        "GDK_PIXBUF_MODULE_FILE",
        "GDK_PIXBUF_MODULEDIR",
        "GSETTINGS_SCHEMA_DIR",
        "XDG_DATA_DIRS",
        "GST_PLUGIN_SYSTEM_PATH_1_0",
        "GST_PLUGIN_PATH_1_0",
        "GST_PLUGIN_SCANNER_1_0",
        "GST_PTP_HELPER_1_0",
        "GST_REGISTRY_REUSE_PLUGIN_SCANNER",
    ] {
        command.env_remove(name);
    }
}
#[cfg(all(test, target_os = "linux"))]
mod tests {
    use super::*;
    #[test]
    fn external_reader_gets_the_desktop_session_without_packaged_library_overrides() {
        let mut c = Command::new("sh");
        c.env("APPIMAGE", "/tmp/CPOBRAS.AppImage")
            .env("LD_LIBRARY_PATH", "/tmp/CPOBRAS.AppDir/usr/lib")
            .env("GIO_MODULE_DIR", "/tmp/CPOBRAS.AppDir/modules")
            .env("DISPLAY", ":test-desktop")
            .env("XDG_DATA_HOME", "/tmp/user-data");
        clean_appimage_environment(&mut c);
        let output=c.arg("-c").arg("test -z \"$APPIMAGE\" && test -z \"$LD_LIBRARY_PATH\" && test -z \"$GIO_MODULE_DIR\" && printf '%s|%s' \"$DISPLAY\" \"$XDG_DATA_HOME\"").output().unwrap();
        assert!(output.status.success());
        assert_eq!(
            String::from_utf8(output.stdout).unwrap(),
            ":test-desktop|/tmp/user-data"
        );
    }
}
