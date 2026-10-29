// Nota single-file portable launcher.
//
// The launcher embeds a 7z archive and the minimal 7zr extractor as Windows
// resources. It extracts once into a versioned LocalAppData cache and starts
// Nota. It never requests elevation and carries Nota's own icon/manifest.

#define UNICODE
#define _UNICODE
#include <windows.h>
#include <shellapi.h>
#include <stdio.h>

#ifndef NOTA_VERSION
#define NOTA_VERSION L"dev"
#endif
#ifndef NOTA_BUILD_ID
#define NOTA_BUILD_ID L"dev"
#endif

#define IDR_PAYLOAD 102
#define IDR_EXTRACTOR 103
#define MAX_CMD 32768

static void fail(const wchar_t *message) {
  MessageBoxW(NULL, message, L"Nota Portable", MB_OK | MB_ICONERROR);
}

static BOOL make_dir(const wchar_t *path) {
  if (CreateDirectoryW(path, NULL)) return TRUE;
  return GetLastError() == ERROR_ALREADY_EXISTS;
}

static BOOL make_tree(wchar_t *path) {
  for (wchar_t *p = path + 3; *p; ++p) {
    if (*p == L'\\' || *p == L'/') {
      wchar_t saved = *p;
      *p = 0;
      if (!make_dir(path)) {
        *p = saved;
        return FALSE;
      }
      *p = saved;
    }
  }
  return make_dir(path);
}

static BOOL write_resource(HMODULE module, int id, const wchar_t *path) {
  HRSRC found = FindResourceW(module, MAKEINTRESOURCEW(id), RT_RCDATA);
  if (!found) return FALSE;
  DWORD size = SizeofResource(module, found);
  HGLOBAL loaded = LoadResource(module, found);
  if (!loaded) return FALSE;
  const void *bytes = LockResource(loaded);
  if (!bytes) return FALSE;

  HANDLE file = CreateFileW(path, GENERIC_WRITE, 0, NULL, CREATE_ALWAYS,
                            FILE_ATTRIBUTE_NORMAL, NULL);
  if (file == INVALID_HANDLE_VALUE) return FALSE;
  DWORD written = 0;
  BOOL ok = WriteFile(file, bytes, size, &written, NULL) && written == size;
  CloseHandle(file);
  return ok;
}

static BOOL file_exists(const wchar_t *path) {
  DWORD attr = GetFileAttributesW(path);
  return attr != INVALID_FILE_ATTRIBUTES && !(attr & FILE_ATTRIBUTE_DIRECTORY);
}

static BOOL join(wchar_t *out, size_t cap, const wchar_t *a, const wchar_t *b) {
  return swprintf(out, cap, L"%ls\\%ls", a, b) > 0;
}

static const wchar_t *arguments_tail(const wchar_t *command_line) {
  if (!command_line) return L"";
  const wchar_t *p = command_line;
  while (*p == L' ' || *p == L'\t') ++p;
  if (*p == L'"') {
    ++p;
    while (*p && *p != L'"') ++p;
    if (*p == L'"') ++p;
  } else {
    while (*p && *p != L' ' && *p != L'\t') ++p;
  }
  while (*p == L' ' || *p == L'\t') ++p;
  return p;
}

int WINAPI wWinMain(HINSTANCE instance, HINSTANCE previous, PWSTR command,
                    int show) {
  (void)previous;
  (void)command;
  (void)show;

  wchar_t local_app_data[32768] = {0};
  if (!GetEnvironmentVariableW(L"LOCALAPPDATA", local_app_data,
                               (DWORD)(sizeof(local_app_data) /
                                       sizeof(local_app_data[0])))) {
    fail(L"LOCALAPPDATA is unavailable. Nota Portable cannot prepare its files.");
    return 2;
  }

  wchar_t root[32768];
  wchar_t app_dir[32768];
  wchar_t cache_id[320];
  swprintf(cache_id, 320, L"%ls-%ls", NOTA_VERSION, NOTA_BUILD_ID);
  if (!join(root, 32768, local_app_data, L"Nota\\Portable") ||
      !make_tree(root) ||
      !join(app_dir, 32768, root, cache_id) ||
      !make_tree(app_dir)) {
    fail(L"Could not create Nota Portable's application cache.");
    return 3;
  }

  wchar_t nota[32768];
  wchar_t ready[32768];
  if (!join(nota, 32768, app_dir, L"nota.exe") ||
      !join(ready, 32768, app_dir, L".ready")) {
    fail(L"Nota Portable path is too long.");
    return 4;
  }

  if (!file_exists(nota) || !file_exists(ready)) {
    wchar_t archive[32768];
    wchar_t extractor[32768];
    wchar_t extract_cmd[MAX_CMD];
    if (GetTempPathW(32768, archive) == 0 ||
        wcscat_s(archive, 32768, L"nota-portable-payload.7z") != 0 ||
        GetTempPathW(32768, extractor) == 0 ||
        wcscat_s(extractor, 32768, L"nota-portable-7zr.exe") != 0) {
      fail(L"Could not create temporary paths for Nota Portable.");
      return 5;
    }
    if (!write_resource(instance, IDR_PAYLOAD, archive) ||
        !write_resource(instance, IDR_EXTRACTOR, extractor)) {
      fail(L"The embedded Nota payload is damaged.");
      return 6;
    }
    if (swprintf(extract_cmd, MAX_CMD,
                 L"\"%ls\" x -y -o\"%ls\" \"%ls\"", extractor, app_dir,
                 archive) <= 0) {
      fail(L"The Nota Portable extraction command is too long.");
      return 7;
    }

    STARTUPINFOW si = {0};
    PROCESS_INFORMATION pi = {0};
    si.cb = sizeof(si);
    si.dwFlags = STARTF_USESHOWWINDOW;
    si.wShowWindow = SW_HIDE;
    if (!CreateProcessW(extractor, extract_cmd, NULL, NULL, FALSE,
                        CREATE_NO_WINDOW, NULL, NULL, &si, &pi)) {
      fail(L"Could not start the embedded Nota extractor.");
      return 8;
    }
    WaitForSingleObject(pi.hProcess, INFINITE);
    DWORD code = 1;
    GetExitCodeProcess(pi.hProcess, &code);
    CloseHandle(pi.hThread);
    CloseHandle(pi.hProcess);
    DeleteFileW(archive);
    DeleteFileW(extractor);
    if (code != 0 || !file_exists(nota)) {
      fail(L"Could not unpack Nota Portable.");
      return 9;
    }
    HANDLE marker = CreateFileW(ready, GENERIC_WRITE, 0, NULL, CREATE_ALWAYS,
                                FILE_ATTRIBUTE_HIDDEN, NULL);
    if (marker != INVALID_HANDLE_VALUE) CloseHandle(marker);
  }

  wchar_t command_line[MAX_CMD];
  const wchar_t *tail = arguments_tail(GetCommandLineW());
  if (tail[0]) {
    if (swprintf(command_line, MAX_CMD, L"\"%ls\" %ls", nota, tail) <= 0) {
      fail(L"The Nota command line is too long.");
      return 10;
    }
  } else if (swprintf(command_line, MAX_CMD, L"\"%ls\"", nota) <= 0) {
    fail(L"The Nota command line is too long.");
    return 10;
  }

  STARTUPINFOW si = {0};
  PROCESS_INFORMATION pi = {0};
  si.cb = sizeof(si);
  if (!CreateProcessW(nota, command_line, NULL, NULL, FALSE, 0, NULL, app_dir,
                      &si, &pi)) {
    fail(L"Nota could not be started from the portable package.");
    return 11;
  }
  CloseHandle(pi.hThread);
  CloseHandle(pi.hProcess);
  return 0;
}
