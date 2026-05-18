{
  # Declarative local service ports. Operator browser access is via SSH local
  # forwarding from the laptop to these host loopback ports.

  host = {
    code = {
      enable = true;
      port = 4821;
    };

    hermesWebui = {
      enable = true;
      port = 8787;
    };

    terminal = {
      enable = true;
      port = 8082;
    };
  };
}
