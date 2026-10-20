#!/usr/bin/env bash

# Builds the Linux prebuild inside the manylinux_2_28 container.
#
# The prebuilt addon is loaded with dlopen() by node-gyp-build, so the host has
# to provide every symbol version the binary asks for. A binary produced on
# Ubuntu 24.04 needs GLIBC_2.38 and GLIBCXX_3.4.32, neither of which exists on
# an Ubuntu 22.04 host. The container pins glibc to 2.28 and the C++ runtime is
# linked statically, so the binary only needs glibc >= 2.28 and does not care
# which libstdc++ the host has.
#
# Usage: scripts/build-linux-prebuild.sh [image]

set -euo pipefail

IMAGE="${1:-quay.io/pypa/manylinux_2_28_x86_64}"
NODE_VERSION="${NODE_VERSION:-22.20.0}"
PNPM_VERSION="${PNPM_VERSION:-11.21.0}"
CMAKE_VERSION="${CMAKE_VERSION:-3.31.6}"
GCC_TOOLSET_VERSION="${GCC_TOOLSET_VERSION:-12}"

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
artifact="node/prebuilds/linux-x64/addon.node"

# The sources are copied into the container without the git metadata, so the
# revision is resolved here and handed to the build.
git_hash="$(git -C "${repo_root}" rev-parse --short HEAD 2>/dev/null || echo unknown)"
git_branch="$(git -C "${repo_root}" rev-parse --abbrev-ref HEAD 2>/dev/null || echo unknown)"

if ! command -v docker >/dev/null 2>&1; then
	echo "docker is required to build the Linux prebuild" >&2
	exit 1
fi

# Git Bash (MSYS) rewrites the POSIX paths of the arguments that are passed to
# a native Windows program: "/work" becomes "C:/Program Files/Git/work" and the
# container command "/bin/bash" becomes a path below the Git installation. The
# conversion has to be switched off and the volume source has to be given as a
# Windows path.
host_os="$(uname -s)"
case "${host_os}" in
MINGW* | MSYS* | CYGWIN*)
	export MSYS_NO_PATHCONV=1
	export MSYS2_ARG_CONV_EXCL='*'
	if command -v cygpath >/dev/null 2>&1; then
		repo_root="$(cygpath -m "${repo_root}")"
	fi
	;;
esac

# The container runs as root, so on a Linux host the copied artefact would be
# owned by root, which breaks later builds of the same path. macOS and Windows
# hosts map the ownership of the mount, so the step is only needed on Linux.
if [ "${host_os}" = "Linux" ] && [ "$(id -u)" != "0" ]; then
	fix_ownership=1
else
	fix_ownership=0
fi

# The build runs on a container-local copy of the sources: the checkout may
# contain a Windows build directory and Windows node_modules, and the code
# generator would otherwise rewrite tracked files as root.
docker run --rm \
	--volume "${repo_root}:/src" \
	--workdir /work \
	--env "NODE_VERSION=${NODE_VERSION}" \
	--env "PNPM_VERSION=${PNPM_VERSION}" \
	--env "CMAKE_VERSION=${CMAKE_VERSION}" \
	--env "GCC_TOOLSET_VERSION=${GCC_TOOLSET_VERSION}" \
	--env "COMP4050_GIT_HASH=${git_hash}" \
	--env "COMP4050_GIT_BRANCH=${git_branch}" \
	--env "COMP4050_STATIC_CXX_RUNTIME=ON" \
	--env "npm_config_manage_package_manager_versions=false" \
	--env "ARTIFACT=/work/${artifact}" \
	--env "ARTIFACT_REL=${artifact}" \
	"${IMAGE}" \
	/bin/bash -euo pipefail -c '
		set -euo pipefail

		dnf install -y --nodocs curl git which unzip tar xz findutils binutils ninja-build

		# AlmaLinux 8 only ships GCC 8, which cannot compile the C++23
		# sources, so the toolset has to be enabled explicitly.
		cxx_major="$(g++ -dumpversion 2>/dev/null || true)"
		cxx_major="${cxx_major%%.*}"
		if [ -z "${cxx_major}" ] || [ "${cxx_major}" -lt 11 ]; then
			toolset_enable="/opt/rh/gcc-toolset-${GCC_TOOLSET_VERSION}/enable"
			if [ ! -f "${toolset_enable}" ]; then
				dnf install -y --nodocs "gcc-toolset-${GCC_TOOLSET_VERSION}" || true
			fi
			if [ -f "${toolset_enable}" ]; then
				. "${toolset_enable}"
			fi
			cxx_major="$(g++ -dumpversion 2>/dev/null || true)"
			cxx_major="${cxx_major%%.*}"
			if [ -z "${cxx_major}" ] || [ "${cxx_major}" -lt 11 ]; then
				echo "a C++23 capable g++ is required; gcc-toolset-${GCC_TOOLSET_VERSION} is not usable" >&2
				exit 1
			fi
		fi

		# A custom image may not ship a recent enough CMake.
		cmake_usable=0
		if command -v cmake >/dev/null 2>&1; then
			version="$(cmake --version | head -1 | sed -n "s/cmake version \([0-9]*\)\.\([0-9]*\).*/\1 \2/p")"
			set -- ${version}
			if [ -n "${1:-}" ] && { [ "${1}" -gt 3 ] || { [ "${1}" -eq 3 ] && [ "${2:-0}" -ge 18 ]; }; }; then
				cmake_usable=1
			fi
		fi

		if [ "${cmake_usable}" != "1" ]; then
			curl -fsSL "https://github.com/Kitware/CMake/releases/download/v${CMAKE_VERSION}/cmake-${CMAKE_VERSION}-linux-x86_64.tar.gz" -o /tmp/cmake.tar.gz
			mkdir -p /opt/cmake
			tar -xzf /tmp/cmake.tar.gz -C /opt/cmake --strip-components=1
			export PATH="/opt/cmake/bin:${PATH}"
		fi

		curl -fsSL "https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-linux-x64.tar.xz" -o /tmp/node.tar.xz
		mkdir -p /opt/node
		tar -xJf /tmp/node.tar.xz -C /opt/node --strip-components=1
		export PATH="/opt/node/bin:${PATH}"
		export COREPACK_ENABLE_DOWNLOAD_PROMPT=0

		corepack enable
		corepack prepare "pnpm@${PNPM_VERSION}" --activate

		mkdir -p /work
		cd /src
		tar --exclude=./node_modules --exclude=./build --exclude=./.git --exclude=./.flatc -cf - . | (cd /work && tar -xf -)

		cd /work
		pnpm install --frozen-lockfile
		pnpm test

		# The optimised build has to come after the tests: the test build
		# would otherwise replace the artefact in build/.
		node scripts/build.mjs --optimize
		npm run build:ts
		pnpm prebuild:binaries

		# The static runtime makes the binary large and the debug info in it
		# is of no use to consumers.
		strip --strip-unneeded "${ARTIFACT}"

		# Smoke test: the stripped binary still loads and the standalone
		# solver still runs.
		node -e "require(process.env.ARTIFACT)"
		/work/build/solver

		node scripts/check-addon-abi.mjs "${ARTIFACT}"

		mkdir -p "/src/$(dirname "${ARTIFACT_REL}")"
		cp "${ARTIFACT}" "/src/${ARTIFACT_REL}"
	'

if [ "${fix_ownership}" = "1" ]; then
	docker run --rm \
		--volume "${repo_root}:/src" \
		--env "HOST_UID=$(id -u)" \
		--env "HOST_GID=$(id -g)" \
		--env "ARTIFACT_REL=${artifact}" \
		"${IMAGE}" \
		/bin/bash -c 'chown "${HOST_UID}:${HOST_GID}" "/src/${ARTIFACT_REL}"'
fi

echo "wrote ${repo_root}/${artifact}"
