cmake_minimum_required(VERSION 3.16)

project(tatkal_engine
    VERSION     1.0.0
    DESCRIPTION "NammaRail — Tatkal Race Simulation Engine"
    LANGUAGES   CXX)

# ─────────────────────────────────────────────────────────────────────────────
# C++17 — MANDATORY
#
# We rely on:
#   • std::shared_mutex        (C++17, <shared_mutex>)
#   • std::atomic::fetch_sub   (C++11, but atomics are most reliable in 17)
#   • if constexpr             (C++17)
#   • std::string_view         (C++17)
#
# CMAKE_CXX_EXTENSIONS OFF enforces -std=c++17, not -std=gnu++17.
# GNU extensions are intentionally excluded to keep the build portable.
# ─────────────────────────────────────────────────────────────────────────────
set(CMAKE_CXX_STANDARD          17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS        OFF)

# ── Build type default ────────────────────────────────────────────────────────
# Use Release unless the caller explicitly sets Debug.
if(NOT CMAKE_BUILD_TYPE)
    set(CMAKE_BUILD_TYPE Release CACHE STRING
        "Build type: Release | Debug | RelWithDebInfo" FORCE)
endif()

# Release: maximum throughput for microsecond-scale ticket races.
#   -O3          : full optimisation (loop vectorisation, inlining, etc.)
#   -march=native: emit AVX2 / SSE4.2 instructions tuned to the host CPU.
#   -DNDEBUG     : disables assert(), removes CROW debug logging.
set(CMAKE_CXX_FLAGS_RELEASE "-O3 -march=native -DNDEBUG")

# Debug: AddressSanitizer + UBSan to catch data races and undefined behavior
# during development. Link flags mirror compile flags.
set(CMAKE_CXX_FLAGS_DEBUG
    "-g -O1 -fsanitize=address,undefined -fno-omit-frame-pointer")
set(CMAKE_EXE_LINKER_FLAGS_DEBUG
    "-fsanitize=address,undefined")

# ── Threading ─────────────────────────────────────────────────────────────────
# Crow's multithreaded() call spawns std::thread workers — we must link pthreads.
find_package(Threads REQUIRED)

# ── Executable ────────────────────────────────────────────────────────────────
add_executable(tatkal_engine
    main.cpp
)

# ── Include paths ─────────────────────────────────────────────────────────────
# include/   → crow_all.h  (Crow single-file header-only amalgamation)
#              Download via:
#              curl -L https://github.com/CrowCpp/Crow/releases/download/v1.2.0/crow_all.h \
#                   -o include/crow_all.h
#
# The Nix asio package installs asio.hpp into the Nix store; CMake finds it
# automatically via the CXX environment set in dev.nix.
target_include_directories(tatkal_engine PRIVATE
    ${CMAKE_SOURCE_DIR}/include
)

# ── Link ──────────────────────────────────────────────────────────────────────
target_link_libraries(tatkal_engine PRIVATE
    Threads::Threads   # -lpthread, required by Crow's thread pool
)

# ── Crow / Asio preprocessor switches ────────────────────────────────────────
#
# CROW_USE_STANDALONE_ASIO:
#   Tells crow_all.h to `#include <asio.hpp>` (standalone)
#   instead of `#include <boost/asio.hpp>`.
#
# ASIO_STANDALONE:
#   Tells asio.hpp itself to compile without any Boost headers.
#
# Both defines must be present together — either alone causes a build failure.
target_compile_definitions(tatkal_engine PRIVATE
    CROW_USE_STANDALONE_ASIO
    ASIO_STANDALONE
)

# ── Friendly status messages ─────────────────────────────────────────────────
message(STATUS "────────────────────────────────────────")
message(STATUS "  Project   : ${PROJECT_NAME} v${PROJECT_VERSION}")
message(STATUS "  Build type: ${CMAKE_BUILD_TYPE}")
message(STATUS "  C++ std   : C++${CMAKE_CXX_STANDARD}")
message(STATUS "  Binary    : tatkal_engine")
message(STATUS "────────────────────────────────────────")
