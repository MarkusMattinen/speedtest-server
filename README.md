# speedtest-server
curl speedtest server written in Node.js

## How do I use it?
Just run `npm install` and `node index.js` or use the supplied Dockerfile.

Then, after the server is running (by default it binds to port 5000), run `curl localhost:5000/megabytes/10`.
You can replace megabytes with either kilobytes or bytes, and 10 with the desired download amount (in megabytes, kilobytes or bytes).

To test upload speed, use curl to PUT/POST data to the server but omit the download amount, for example:
`dd if=/dev/urandom | base64 | dd bs=1024 count=10240 | curl -X POST -d @- localhost:5000/`

You can also test both upload and download speed with a single request by POSTing/PUTing to an URL that specifies the desired download amount, for example:
`dd if=/dev/urandom | base64 | dd bs=1024 count=10240 | curl -X POST -d @- localhost:5000/megabytes/10`

## How does it work?

It (ab)uses a feature called chunk extensions in HTTP/1.1 chunked transfer encoding.
According to the RFC chunk extensions that the client does not understand MUST be ignored by the client, so we can just put as much data as we want there and none of it will be visible in the curl output.
Then while sending and/or receiving data we just determine on the server-side how long it took, and then in another chunk in the same request we send the results.

Unfortunately, it seems that some browsers don't like large amounts of data in chunk extensions, so they refuse to load the page.
There is currently a workaround for Chrome that limits each line of chunk extensions to 16000 characters and sends a single space in each chunk.
On Safari this does not seem to work at all. Other browsers have not been tested.
