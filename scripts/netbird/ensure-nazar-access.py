#!/usr/bin/env python3
"""Ensure Nazar NetBird access policy, DNS, and optional install setup key.

This script is intentionally idempotent and keeps secrets outside git. It reads a
NetBird API token from NETBIRD_TOKEN, NETBIRD_API_TOKEN, or a root-only token file
(default: /root/.nazar-secrets/netbird-api-token).

It manages:
- groups for admins/proxmox-hosts/vms/service groups;
- NetBird SSH policy mapping admins to local user alex on nazar;
- private nazar.studio custom-zone records for NetBird peers;
- optional one-off setup key creation for nixos-anywhere --extra-files.
"""

from __future__ import annotations

import argparse
import json
import os
import stat
import sys
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any

API = os.environ.get("NETBIRD_API_URL", "https://api.netbird.io/api").rstrip("/")
DEFAULT_TOKEN_FILE = "/root/.nazar-secrets/netbird-api-token"

GROUP_ADMINS = "admins"
GROUP_HOSTS = "proxmox-hosts"
GROUP_VMS = "vms"
GROUP_DAV = "dav-services"

POLICY_NAZAR_SSH = "admins-to-nazar-netbird-ssh"
POLICY_HOST_SERVICES = "admins-to-proxmox-services"
POLICY_MC_TCP = "admins-to-minecraft-private"
POLICY_MC_UDP = "admins-to-minecraft-voice-private"
POLICY_DAV = "admins-to-dav-private"

ZONE_DOMAIN = "nazar.studio"


def die(message: str) -> None:
    print(f"error: {message}", file=sys.stderr)
    sys.exit(1)


def load_token() -> str:
    token = os.environ.get("NETBIRD_TOKEN") or os.environ.get("NETBIRD_API_TOKEN")
    if token:
        return token

    token_file = os.environ.get("NETBIRD_TOKEN_FILE", DEFAULT_TOKEN_FILE)
    try:
        st = os.stat(token_file)
    except FileNotFoundError:
        die(f"set NETBIRD_TOKEN/NETBIRD_API_TOKEN or store the token in {token_file}")

    if st.st_mode & (stat.S_IRWXG | stat.S_IRWXO):
        die(f"refusing to read {token_file}: permissions must be 0600 or stricter")
    with open(token_file, "r", encoding="utf-8") as fh:
        token = fh.read().strip()
    if not token:
        die(f"empty token file: {token_file}")
    return token


TOKEN: str | None = None


def request(method: str, path: str, body: dict[str, Any] | None = None) -> Any:
    global TOKEN
    if TOKEN is None:
        TOKEN = load_token()
    data = None if body is None else json.dumps(body, sort_keys=True).encode()
    req = urllib.request.Request(
        f"{API}{path}",
        data=data,
        method=method,
        headers={
            "Accept": "application/json",
            "Authorization": f"Token {TOKEN}",
            **({"Content-Type": "application/json"} if body is not None else {}),
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            raw = resp.read().decode()
            return json.loads(raw) if raw else None
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode(errors="replace")
        die(f"{method} {path} failed with HTTP {exc.code}: {detail}")
    except urllib.error.URLError as exc:
        die(f"{method} {path} failed: {exc}")


def as_list(value: Any, *keys: str) -> list[Any]:
    if isinstance(value, list):
        return value
    if isinstance(value, dict):
        for key in keys + ("items", "groups", "peers", "policies", "records", "zones"):
            if isinstance(value.get(key), list):
                return value[key]
    return []


def norm(value: Any) -> str:
    return str(value or "").strip().lower()


def peer_label(peer: dict[str, Any]) -> str:
    return str(peer.get("name") or peer.get("hostname") or peer.get("id"))


def peer_ip(peer: dict[str, Any]) -> str | None:
    ip = peer.get("ip") or peer.get("netbird_ip") or peer.get("address")
    return str(ip).split("/")[0] if ip else None


def list_peers() -> list[dict[str, Any]]:
    return [p for p in as_list(request("GET", "/peers"), "peers") if isinstance(p, dict)]


def list_groups() -> list[dict[str, Any]]:
    return [g for g in as_list(request("GET", "/groups"), "groups") if isinstance(g, dict)]


def match_peers(peers: list[dict[str, Any]], names: set[str]) -> list[str]:
    wanted = {norm(name) for name in names}
    matched: list[str] = []
    for peer in peers:
        labels = {
            norm(peer.get("name")),
            norm(peer.get("hostname")),
            norm(peer.get("fqdn")),
        }
        if labels & wanted and peer.get("id"):
            matched.append(peer["id"])
    return sorted(set(matched))


def ensure_group(groups: dict[str, dict[str, Any]], name: str, peer_ids: list[str] | None = None) -> dict[str, Any]:
    peer_ids = sorted(set(peer_ids or []))
    group = groups.get(name)
    if not group:
        created = request("POST", "/groups", {"name": name, "peers": peer_ids, "resources": []})
        if not isinstance(created, dict):
            die(f"failed to create group {name}")
        print(f"created group: {name}")
        groups[name] = created
        return created

    current_peer_ids = sorted(
        p["id"] for p in as_list(group.get("peers"), "peers") if isinstance(p, dict) and p.get("id")
    )
    # Some API responses expose only counts for groups. If peers are absent, do a
    # conservative PUT only when we have explicit peer IDs to enforce.
    if peer_ids and current_peer_ids != peer_ids:
        updated = request(
            "PUT",
            f"/groups/{group['id']}",
            {
                "name": name,
                "peers": peer_ids,
                "resources": group.get("resources") or [],
            },
        )
        if not isinstance(updated, dict):
            die(f"failed to update group {name}")
        print(f"updated group peers: {name} -> {len(peer_ids)} peer(s)")
        groups[name] = updated
        return updated

    print(f"group ok: {name}")
    return group


def policy_body(name: str, description: str, rules: list[dict[str, Any]]) -> dict[str, Any]:
    return {
        "name": name,
        "description": description,
        "enabled": True,
        "source_posture_checks": [],
        "rules": rules,
    }


def comparable_policy(policy: dict[str, Any]) -> dict[str, Any]:
    cleaned = {
        "name": policy.get("name"),
        "description": policy.get("description", ""),
        "enabled": policy.get("enabled", True),
        "source_posture_checks": policy.get("source_posture_checks") or [],
        "rules": [],
    }
    for rule in policy.get("rules") or []:
        if not isinstance(rule, dict):
            continue
        cleaned["rules"].append(
            {
                k: rule.get(k)
                for k in (
                    "name",
                    "description",
                    "enabled",
                    "action",
                    "bidirectional",
                    "protocol",
                    "ports",
                    "port_ranges",
                    "sources",
                    "destinations",
                    "authorized_groups",
                )
                if rule.get(k) not in (None, [], {})
            }
        )
    return cleaned


def ensure_admin_user_auto_groups(admins_group_id: str) -> None:
    users = [u for u in as_list(request("GET", "/users"), "users") if isinstance(u, dict)]
    for user in users:
        if user.get("is_service_user") or user.get("is_blocked"):
            continue
        if user.get("role") not in ("admin", "owner"):
            continue
        current = list(user.get("auto_groups") or [])
        wanted = sorted(set(current + [admins_group_id]))
        if wanted == sorted(current):
            print(f"user auto-groups ok: {user.get('name') or user.get('id')}")
            continue
        request(
            "PUT",
            f"/users/{user['id']}",
            {
                "role": user.get("role") or "user",
                "auto_groups": wanted,
                "is_blocked": False,
            },
        )
        print(f"updated user auto-groups: {user.get('name') or user.get('id')} -> admins")


def ensure_policy(policies: dict[str, dict[str, Any]], body: dict[str, Any]) -> None:
    existing = policies.get(body["name"])
    wanted = comparable_policy(body)
    if existing:
        if comparable_policy(existing) == wanted:
            print(f"policy ok: {body['name']}")
            return
        request("PUT", f"/policies/{existing['id']}", body)
        print(f"updated policy: {body['name']}")
        return
    created = request("POST", "/policies", body)
    print(f"created policy: {body['name']} ({created.get('id') if isinstance(created, dict) else 'ok'})")


def ensure_zone(groups: dict[str, dict[str, Any]], records: dict[str, str]) -> None:
    distribution_names = [GROUP_ADMINS, GROUP_HOSTS, GROUP_VMS]
    distribution_ids = [groups[name]["id"] for name in distribution_names if name in groups]
    zones = as_list(request("GET", "/dns/zones"), "zones")
    zone = next((z for z in zones if isinstance(z, dict) and z.get("domain") == ZONE_DOMAIN), None)
    zone_body = {
        "name": ZONE_DOMAIN,
        "domain": ZONE_DOMAIN,
        "enabled": True,
        "enable_search_domain": False,
        "distribution_groups": distribution_ids,
    }
    if not zone:
        zone = request("POST", "/dns/zones", zone_body)
        if not isinstance(zone, dict) or not zone.get("id"):
            die("failed to create DNS zone")
        print(f"created DNS zone: {ZONE_DOMAIN}")
    else:
        current_dist = sorted(zone.get("distribution_groups") or [])
        if current_dist != sorted(distribution_ids) or not zone.get("enabled", True):
            zone = request("PUT", f"/dns/zones/{zone['id']}", zone_body)
            print(f"updated DNS zone: {ZONE_DOMAIN}")
        else:
            print(f"DNS zone ok: {ZONE_DOMAIN}")

    existing_records = as_list(request("GET", f"/dns/zones/{zone['id']}/records"), "records")
    by_name = {r.get("name"): r for r in existing_records if isinstance(r, dict) and r.get("name")}
    for name, content in sorted(records.items()):
        body = {"name": name, "type": "A", "content": content, "ttl": 300}
        existing = by_name.get(name)
        if not existing:
            request("POST", f"/dns/zones/{zone['id']}/records", body)
            print(f"created DNS record: {name} -> {content}")
        elif existing.get("type") != "A" or existing.get("content") != content or existing.get("ttl") != 300:
            request("PUT", f"/dns/zones/{zone['id']}/records/{existing['id']}", body)
            print(f"updated DNS record: {name} -> {content}")
        else:
            print(f"DNS record ok: {name} -> {content}")


def create_setup_key(groups: dict[str, dict[str, Any]], output: Path, expires_in: int) -> None:
    body = {
        "name": "nazar-nixos-anywhere-install",
        "type": "one-off",
        "expires_in": expires_in,
        "auto_groups": [groups[GROUP_HOSTS]["id"]],
        "usage_limit": 1,
        "ephemeral": False,
        "allow_extra_dns_labels": False,
    }
    created = request("POST", "/setup-keys", body)
    if not isinstance(created, dict) or not created.get("key"):
        die("setup key API response did not include a key")
    output.parent.mkdir(parents=True, exist_ok=True)
    fd = os.open(output, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, "w", encoding="utf-8") as fh:
        fh.write(str(created["key"]).strip() + "\n")
    os.chmod(output, 0o600)
    print(f"wrote one-off setup key to {output} (secret not printed)")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--write-setup-key",
        type=Path,
        help="Create a one-off nazar setup key and write it to this extra-files path.",
    )
    parser.add_argument("--setup-key-expires-in", type=int, default=86400)
    args = parser.parse_args()

    peers = list_peers()
    by_label = {norm(peer_label(peer)): peer for peer in peers}
    nazar = by_label.get("nazar") or next((p for p in peers if norm(p.get("hostname")) == "nazar"), None)
    if not nazar:
        print("warning: nazar peer not found yet; DNS/policies will still be prepared where possible", file=sys.stderr)
    nazar_ip = peer_ip(nazar) if nazar else None

    groups_by_name = {g.get("name"): g for g in list_groups() if g.get("name")}
    admins = ensure_group(
        groups_by_name,
        GROUP_ADMINS,
        match_peers(peers, {"laptop", "yoga", "evo-x1", "nixos"}),
    )
    hosts = ensure_group(groups_by_name, GROUP_HOSTS, match_peers(peers, {"nazar"}))
    ensure_group(groups_by_name, GROUP_VMS, match_peers(peers, {"git", "minecraft", "dav"}))
    dav_group = ensure_group(groups_by_name, GROUP_DAV, match_peers(peers, {"dav"}))
    ensure_admin_user_auto_groups(admins["id"])

    policies = {p.get("name"): p for p in as_list(request("GET", "/policies"), "policies") if isinstance(p, dict) and p.get("name")}
    ensure_policy(
        policies,
        policy_body(
            POLICY_NAZAR_SSH,
            "Allow admin NetBird identities to SSH to nazar only as local user alex.",
            [
                {
                    "name": "admins-alex-only",
                    "description": "NetBird SSH to nazar maps admins to local alex; root is not allowed.",
                    "enabled": True,
                    "action": "accept",
                    "bidirectional": False,
                    "protocol": "netbird-ssh",
                    "sources": [admins["id"]],
                    "destinations": [hosts["id"]],
                    "authorized_groups": {admins["id"]: ["alex"]},
                }
            ],
        ),
    )
    ensure_policy(
        policies,
        policy_body(
            POLICY_HOST_SERVICES,
            "Allow admins to reach private web/proxy services on nazar over NetBird.",
            [
                {
                    "name": "nazar-private-services",
                    "description": "Dashboard, reverse proxy, Proxmox UI, and Forgejo SSH proxy.",
                    "enabled": True,
                    "action": "accept",
                    "bidirectional": False,
                    "protocol": "tcp",
                    "ports": ["80", "443", "8006", "10022"],
                    "sources": [admins["id"]],
                    "destinations": [hosts["id"]],
                }
            ],
        ),
    )
    ensure_policy(
        policies,
        policy_body(
            POLICY_MC_TCP,
            "Allow admins private Minecraft TCP access through nazar.",
            [
                {
                    "name": "minecraft-java",
                    "enabled": True,
                    "action": "accept",
                    "bidirectional": False,
                    "protocol": "tcp",
                    "ports": ["25565"],
                    "sources": [admins["id"]],
                    "destinations": [hosts["id"]],
                }
            ],
        ),
    )
    ensure_policy(
        policies,
        policy_body(
            POLICY_MC_UDP,
            "Allow admins private Minecraft Simple Voice Chat UDP access through nazar.",
            [
                {
                    "name": "minecraft-voice",
                    "enabled": True,
                    "action": "accept",
                    "bidirectional": False,
                    "protocol": "udp",
                    "ports": ["24454"],
                    "sources": [admins["id"]],
                    "destinations": [hosts["id"]],
                }
            ],
        ),
    )

    ensure_policy(
        policies,
        policy_body(
            POLICY_DAV,
            "Allow admins private DAV access over NetBird.",
            [
                {
                    "name": "dav-http",
                    "enabled": True,
                    "action": "accept",
                    "bidirectional": False,
                    "protocol": "tcp",
                    "ports": ["80"],
                    "sources": [admins["id"]],
                    "destinations": [dav_group["id"]],
                }
            ],
        ),
    )

    if nazar_ip:
        records = {
            "nazar.studio": nazar_ip,
            "pve.nazar.studio": nazar_ip,
            "git.nazar.studio": nazar_ip,
            "mc.nazar.studio": nazar_ip,
        }
        peer = by_label.get("dav")
        if peer and peer_ip(peer):
            records["dav.nazar.studio"] = peer_ip(peer)  # direct VM NetBird peer if present
        ensure_zone(groups_by_name, records)

    if args.write_setup_key:
        create_setup_key(groups_by_name, args.write_setup_key, args.setup_key_expires_in)

    print("done: nazar NetBird access baseline is reconciled")


if __name__ == "__main__":
    main()
