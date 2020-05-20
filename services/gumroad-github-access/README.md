# gumroad-github-access

This Deno (https://deno.land) service runs on Google Cloud Run (https://cloud.run)
and exposes an endpoint used by Gumroad's Ping (https://gumroad.com/ping) service.

For each purchase for the "[Cloud Native Web Development](https://gum.co/cloud-native-web-development)" book,
Gumroad sends a request to this endpoint, which in turns adds the buyer's email address
to the book owners team.

This team has access to the private repository with the source code that corresponds to
the chapters in the book.