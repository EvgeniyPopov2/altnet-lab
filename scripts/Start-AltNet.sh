#!/usr/bin/env bash
set -euo pipefail
umask 077
root=$(cd -- "$(dirname -- "$0")" && pwd)
cd "$root"
state="${ALTNET_STATE:-${XDG_STATE_HOME:-$HOME/.local/state}/altnet}"
mkdir -p -- "$state/temp"
export TMPDIR="$state/temp"
if [[ -x "$root/runtime-linux/tor/tor" ]]; then
    tor="$root/runtime-linux/tor/tor"
    transport="$root/runtime-linux/tor/pluggable_transports/lyrebird"
    snow=(--snowflake "$transport")
else
    tor=$(command -v tor)
    transport=$(command -v lyrebird || command -v obfs4proxy)
    snow=()
    if [[ "$transport" == */lyrebird ]]; then snow=(--snowflake "$transport"); fi
fi
exec python3 -B "$root/scripts/bridge_client.py" --state "$state" --dist "$root/ui" \
    --tor "$tor" --transport "$transport" "${snow[@]}" --keyring "$root/trusted.gpg" --seed "$root/seed" "$@"

