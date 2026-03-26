#!/usr/bin/env bash
# NetBird, Matrix, and service-surface phase helpers for setup-wizard.sh.

print_service_access_summary() {
	local _installed_services="$1" mesh_ip="$2" mesh_fqdn="$3"
	local canonical_host=""
	canonical_host=$(canonical_service_host)
	local access_mode=""
	access_mode=$(canonical_access_mode)

	echo "  Service access:"
	if [[ -n "$canonical_host" ]]; then
		echo "    NixPI Home   - https://${canonical_host}/"
		echo "    Share this   - send other NetBird peers the NixPI Home URL"
	elif [[ "$access_mode" == "not-ready" ]]; then
		echo "    Canonical host - not ready yet (finish NetBird setup)"
	fi
	echo "    Recovery     - http://localhost/ (on-box only)"
}

step_netbird() {
	echo ""
	echo "--- NetBird Mesh Network ---"
	echo "NetBird creates a private mesh network so you can access this device from anywhere."
	echo ""

	if ! systemctl is-active --quiet netbird.service; then
		echo "Starting NetBird daemon..."
		root_command nixpi-bootstrap-netbird-systemctl start netbird.service 2>/dev/null || true
	fi
	local wait_count=0
	while [[ ! -S /var/run/netbird/sock ]]; do
		wait_count=$((wait_count + 1))
		if [[ $wait_count -ge 20 ]]; then
			echo "ERROR: NetBird daemon did not start. Run 'sudo systemctl status netbird' to debug."
			return 1
		fi
		sleep 0.5
	done

	echo "Connection options:"
	echo "  1) Web login (OAuth) - requires a desktop/browser session"
	echo "  2) Setup key - for headless/automated setup"
	echo "  3) Skip - configure later"
	echo ""

	if [[ "$NONINTERACTIVE_SETUP" -eq 1 && -z "${PREFILL_NETBIRD_KEY:-}" ]]; then
		echo "Skipping NetBird setup in noninteractive mode."
		mark_done netbird
		return
	fi

	while true; do
		read -rp "Select option [1/2/3]: " nb_choice
		case "$nb_choice" in
			1|web|oauth|login)
				echo ""
				if has_gui_session; then
					echo "Starting NetBird web login..."
					echo "If no browser opens, visit the URL shown below."
				else
					echo "No local desktop session is active."
					echo "NetBird may print a login URL, but it cannot open a browser window here."
					echo "Use option 2 with a setup key, or retry once the XFCE desktop is running."
				fi
				if root_command nixpi-bootstrap-netbird-up 2>&1; then
					for _ in $(seq 1 30); do
						sleep 1
						local status
						status=$(netbird status 2>/dev/null || true)
						if echo "$status" | grep -q "Connected"; then
							local mesh_ip
							mesh_ip=$(echo "$status" | grep -oP 'NetBird IP:\s+\K[\d.]+' || true)
							if [[ -n "$mesh_ip" ]]; then
								echo ""
								echo "Connected! Mesh IP: ${mesh_ip}"
								mark_done_with netbird "$mesh_ip"
								return
							fi
						fi
					done
					echo ""
					echo "Connection is taking longer than expected."
					echo "Check status with: netbird status"
					return 1
				fi
				echo ""
				echo "NetBird connection failed. Try again or use a setup key."
				;;
			2|key|setup-key)
				echo ""
				echo "Get a setup key from: https://app.netbird.io/setup-keys"
				while true; do
					if [[ -n "${PREFILL_NETBIRD_KEY:-}" ]]; then
						setup_key="$PREFILL_NETBIRD_KEY"
						echo "Setup key: [prefilled]"
					else
						read -rp "Setup key: " setup_key
					fi
					if [[ -z "$setup_key" ]]; then
						echo "Setup key cannot be empty."
						continue
					fi

					echo "Connecting to NetBird..."
					if root_command nixpi-bootstrap-netbird-up --setup-key "$setup_key" 2>&1; then
						sleep 3
						local status
						status=$(netbird status 2>/dev/null || true)

						if echo "$status" | grep -q "Connected"; then
							local mesh_ip
							mesh_ip=$(echo "$status" | grep -oP 'NetBird IP:\s+\K[\d.]+' || true)
							if [[ -n "$mesh_ip" ]]; then
								echo ""
								echo "Connected! Mesh IP: ${mesh_ip}"
								mark_done_with netbird "$mesh_ip"
								return
							fi
						fi
					fi
					echo ""
					echo "NetBird connection failed. Check your setup key and try again."
				done
				;;
			3|skip)
				echo "Skipping NetBird setup. You can configure later with: sudo netbird up"
				mark_done netbird
				return
				;;
			*)
				echo "Invalid option. Please enter 1, 2, or 3."
				;;
		esac
	done
}

step_services() {
	echo ""
	echo "--- Built-In Services ---"
	if ! has_service_stack; then
		echo "Built-in service stack is not installed in this profile. Skipping."
		mark_done_with services "skipped"
		return
	fi
	root_command nixpi-bootstrap-service-systemctl restart nixpi-chat.service || echo "  chat restart failed."
	mark_done_with services "chat"
}
