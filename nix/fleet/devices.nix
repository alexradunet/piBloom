{
  wireguard = {
    network = "10.44.0.0/24";
    dns = "10.44.0.1";
    endpoint = "167.235.12.22:51820";

    peers = {
      nazar = {
        publicKey = "fEozEucajS9kJea4ydv1iUCOG8ckAwYJL+SsB7D/Wkc=";
        address = "10.44.0.1/24";
      };
    };
  };
}
