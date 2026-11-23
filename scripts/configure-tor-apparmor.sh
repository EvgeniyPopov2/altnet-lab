#!/usr/bin/env bash
set -euo pipefail

# Дополнение к профилю Ubuntu сохраняется при обновлении пакета tor.
profile=/etc/apparmor.d/system_tor
local_rules=/etc/apparmor.d/local/system_tor
test -f "$profile"
install -d -m 0755 /etc/apparmor.d/local
touch "$local_rules"
for rule in '/etc/tor/torrc.d/ r,' '/etc/tor/torrc.d/*.conf r,'; do
  if ! grep -Fxq -- "$rule" "$local_rules"; then
    printf '\n%s\n' "$rule" >> "$local_rules"
  fi
done
apparmor_parser -r "$profile"
