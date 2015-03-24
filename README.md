# speedtest-server
curl speedtest server written in Node.js

## How do I use it?
Just run `npm install` and `node index.js` or use the supplied Dockerfile.

To test downloading 10 megabytes of data, run `curl localhost:5000/megabytes/10`.
You can also specify bytes or kilobytes.

To test downloading as much data as possible in exactly 5 seconds, run `curl localhost:5000/seconds/5`.

To test upload speed, first prepare a sufficiently large test file: `dd if=/dev/urandom | base64 | dd bs=1024 count=102400 of=testfile`.
This creates a 100MB file, if you are connecting to localhost or have an extremely fast connection you might want an even larger one.

Then use curl to PUT/POST data to the server, for example:
`curl -X POST -T testfile localhost:5000/`

To abort the upload and return the results after 5 seconds, run
`curl -N -X POST -T testfile localhost:5000/seconds/5`

NOTE: it seems that this is not enough for curl to actually stop uploading the file, but it does print the results when they are available if you use -N option with curl. It is then possible to kill curl after receiving the results. For reference, here is an extremely ugly bash snippet that does just that (assumes Linux, for OS X you may need to adjust the mktemp command):

```
speed=$(
  PIDFILE="$(mktemp)"
  (curl -sSLX POST -T $randfile $url -N & echo $! >&3) 3>"$PIDFILE" | while read line; do
    output=$(echo $line | grep -oh '"uploadBytesPerSecond": [0-9]*' | awk '{print $2}')
    if [ ! -z "$output" ]; then
      kill $(cat $PIDFILE)
      echo $output
    fi
  done
  rm "$PIDFILE"
)
```

If you have a better suggestion for how to do this, feel free to drop me an issue or a pull request.

## How does it work?

It (ab)uses a feature called chunk extensions in HTTP/1.1 chunked transfer encoding.
According to the RFC chunk extensions that the client does not understand MUST be ignored by the client, so we can just put as much data as we want there and none of it will be visible in the curl output.
Then while sending and/or receiving data we just determine on the server-side how long it took, and then in another chunk in the same request we send the results.

Unfortunately, it seems that some browsers don't like large amounts of data in chunk extensions, so they refuse to load the page.
I have implemented a workaround for Chrome that limits each line of chunk extensions to 16000 characters and sends a single space in each chunk.
On Safari this does not seem to work at all. Other browsers have not been tested.
