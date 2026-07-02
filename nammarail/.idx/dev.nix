# .idx/dev.nix — Google Project IDX Nix Environment
# Adds a complete C++17 toolchain for the Tatkal Race Simulation Engine.
#
# After editing this file:
#   IDX menu → File → Rebuild Environment
#   (or: Ctrl+Shift+P → "IDX: Rebuild Environment")
# ---------------------------------------------------------------------------

{ pkgs, ... }: {

  # Pin to a stable, reproducible Nixpkgs channel.
  # "stable-23.11" ships GCC 13.2, CMake 3.27, and standalone Asio 1.28.
  channel = "stable-23.11";

  packages = [
    # ── C++17 Toolchain ─────────────────────────────────────────────────────
    pkgs.gcc          # GCC 13 — ships both gcc and g++
    pkgs.cmake        # Build system generator (3.27+)
    pkgs.gnumake      # GNU Make backend for CMake

    # ── Asio (standalone) ────────────────────────────────────────────────────
    # Crow uses Asio for its async I/O reactor.
    # "standalone" Asio means no Boost dependency — just asio.hpp.
    pkgs.asio

    # ── Dev utilities ────────────────────────────────────────────────────────
    pkgs.curl         # Download crow_all.h + test /ping from the shell
    pkgs.gdb          # GNU debugger
    pkgs.valgrind     # Memory profiler (optional, useful for race detection)
  ];

  # Explicitly surface g++ as the CXX compiler so CMake's auto-detection
  # never falls back to clang (which ships in the IDX base image).
  env = {
    CC  = "${pkgs.gcc}/bin/gcc";
    CXX = "${pkgs.gcc}/bin/g++";
  };

  idx = {
    # VS Code extensions to install inside IDX automatically.
    extensions = [
      "ms-vscode.cpptools"      # IntelliSense, hover docs, debugging
      "ms-vscode.cmake-tools"   # CMake configure / build / run from the IDE
      "twxs.cmake"              # CMake syntax highlighting in CMakeLists.txt
    ];

    workspace = {
      onCreate = {
        # Open the engine source on first workspace create
        default.openFiles = [ "tatkal-engine/main.cpp" ];
      };
    };
  };
}
