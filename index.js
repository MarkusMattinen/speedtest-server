#!/usr/bin/env node
'use strict';

var http = require('http');
var _ = require('lodash');

var chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghiklmnopqrstuvwxyz';

function writeData(data, res, chunkExtensionLengthMax) {
  if (chunkExtensionLengthMax <= 0) {
    return !res.write(data);
  }

  var i = 0;
  var buffered = false;

  for (var i = 0; i < data.length; i += chunkExtensionLengthMax) {
    var ret = res.write(data.slice(i, i + chunkExtensionLengthMax) + "\r\n \r\n1;data=");

    if (ret === false) buffered = true;
  }

  return buffered;
}

function generateRandomData(length) {
  length = length ? length : 32;

  var string = '';

  for (var i = 0; i < length; i++) {
    var randomNumber = Math.floor(Math.random() * chars.length);
    string += chars.substring(randomNumber, randomNumber + 1);
  }

  return string;
}

var randomMegabyte = generateRandomData(1024 * 1024);

function milliTime() {
  return hrTimeToMillis(process.hrtime());
}

function hrTimeToMillis(hrTime) {
  return hrTime[0] * 1000 + hrTime[1] / 1000000;
}

var server = http.createServer(function(req, res) {
  var startTimeMillis = milliTime();
  var uploadBytes = 0;
  var chunkExtensionMaxLength = -1;
  var requestEnded = false;

  if (req.headers['user-agent']) {
    var chromeWorkaround = req.headers['user-agent'].toLowerCase().indexOf('chrome') !== -1;
  }

  if (chromeWorkaround) {
    chunkExtensionMaxLength = 16000;
  }

  var bytesToWrite = 0;
  var maxSeconds = 0;
  var secondsMode = false;
  var parts = _.filter(req.url.split('/'));

  if (parts.length >= 2) {
    var multiplier;

    switch (parts[0]) {
    case 'byte':
    case 'bytes':
      multiplier = 1;
      break;
    case 'kilobyte':
    case 'kilobytes':
      multiplier = 1024;
      break;
    case 'megabyte':
    case 'megabytes':
      multiplier = 1024 * 1024;
      break;
    case 'seconds':
      secondsMode = true;
      break;
    default:
      multiplier = 0;
      break;
    }

    if (secondsMode) {
      maxSeconds = Number(parts[1]);
      bytesToWrite = 65536;
    } else {
      bytesToWrite = Number(parts[1]) * multiplier;
    }
  }

  if (!_.isFinite(bytesToWrite)) {
    bytesToWrite = 0;
  }

  var onEnd = function() {
    var requestEndTimeMillis = milliTime();

    if (requestEnded) {
      return;
    }

    requestEnded = true;

    if (secondsMode && uploadBytes > 0) {
      bytesToWrite = 0;
    }

    var downloadBytes = 0;

    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Transfer-Encoding': 'chunked'
    });

    // we will do manual chunking of the data
    res.chunkedEncoding = false;

    // disable Nagle's algorithm for more accurate results
    res.socket.setNoDelay();

    // send the random data in a dummy chunk's chunk extension
    res.write("1;data=");

    var ended = false;

    var responseStartTimeMillis = milliTime();

    var onDrain = function() {
      if (ended) {
        return;
      }

      if (secondsMode && bytesToWrite > 0) {
        if ((milliTime() - responseStartTimeMillis) / 1000 < maxSeconds) {
          var dataToWrite = randomMegabyte.slice(0, bytesToWrite);
          var buffered = writeData(dataToWrite, res, chunkExtensionMaxLength);
          downloadBytes += dataToWrite.length;

          if (buffered) {
            // data was buffered, wait for drain event
            return;
          } else {
            // data was not buffered, ready to send more data immediately
            setImmediate(onDrain);
            return;
          }
        }
      } else {
        if (downloadBytes < bytesToWrite) {
          var dataToWrite = randomMegabyte.slice(0, bytesToWrite - downloadBytes);
          var buffered = writeData(dataToWrite, res, chunkExtensionMaxLength);
          downloadBytes += dataToWrite.length;

          if (buffered) {
            // data was buffered, wait for drain event
            return;
          } else {
            // data was not buffered, ready to send more data immediately
            setImmediate(onDrain);
            return;
          }
        }
      }

      var responseEndTimeMillis = milliTime();

      if (!chromeWorkaround) {
        // send first character of the speed results in a dummy chunk
        res.write("\r\n{\r\n");
      } else {
        res.write("\r\n \r\n");
      }

      var speedResults = {};

      if (uploadBytes > 0) {
        var uploadMillis = requestEndTimeMillis - startTimeMillis;
        var uploadBytesPerSecond = uploadBytes / (uploadMillis / 1000);
        var uploadResults = {
          'uploadMilliseconds': uploadMillis,
          'uploadSeconds': uploadMillis / 1000,
          'uploadBytes': uploadBytes,
          'uploadKilobytes': uploadBytes / 1024,
          'uploadMegabytes': uploadBytes / 1024 / 1024,
          'uploadBytesPerSecond': uploadBytesPerSecond,
          'uploadBitsPerSecond': uploadBytesPerSecond * 8,
          'uploadKilobytesPerSecond': uploadBytesPerSecond / 1024,
          'uploadKilobitsPerSecond': uploadBytesPerSecond / 1024 * 8,
          'uploadMegabytesPerSecond': uploadBytesPerSecond / 1024 / 1024,
          'uploadMegabitsPerSecond': uploadBytesPerSecond / 1024 / 1024 * 8
        };

        speedResults = _.extend(speedResults, uploadResults);
      }

      if (downloadBytes > 0) {
        var downloadMillis = responseEndTimeMillis - responseStartTimeMillis;
        var downloadBytesPerSecond = downloadBytes / (downloadMillis / 1000);
        var downloadResults = {
          'downloadMilliseconds': downloadMillis,
          'downloadSeconds': downloadMillis / 1000,
          'downloadBytes': downloadBytes,
          'downloadKilobytes': downloadBytes / 1024,
          'downloadMegabytes': downloadBytes / 1024 / 1024,
          'downloadBytesPerSecond': downloadBytesPerSecond,
          'downloadBitsPerSecond': downloadBytesPerSecond * 8,
          'downloadKilobytesPerSecond': downloadBytesPerSecond / 1024,
          'downloadKilobitsPerSecond': downloadBytesPerSecond / 1024 * 8,
          'downloadMegabytesPerSecond': downloadBytesPerSecond / 1024 / 1024,
          'downloadMegabitsPerSecond': downloadBytesPerSecond / 1024 / 1024 * 8,
        };

        speedResults = _.extend(speedResults, downloadResults);
      }

      var speedResultString;

      if (chromeWorkaround) {
        var speedResultString = "\r\n" + JSON.stringify(speedResults, null, 2) + "\r\n";
      } else {
        // leave out the first {, because we already sent it in the dummy chunk
        var speedResultString = JSON.stringify(speedResults, null, 2).slice(1) + "\r\n";
      }

      if (res.socket) res.socket.removeListener('drain', onDrain);

      // send the results chunk and finalize the chunked encoding
      res.end(speedResultString.length.toString(16) + "\r\n" + speedResultString + "\r\n0\r\n\r\n");
      ended = true;
    }

    res.socket.on('drain', onDrain);

    // if everything fit in the OS buffers, we won't get a drain event
    var dataToWrite = randomMegabyte.slice(0, bytesToWrite);
    var buffered = writeData(dataToWrite, res, chunkExtensionMaxLength);
    downloadBytes += dataToWrite.length;

    if (!buffered) {
      setImmediate(onDrain);
    }
  };

  req.on('data', function(chunk) {
    if (requestEnded) {
      return;
    }

    uploadBytes += chunk.length;

    if (secondsMode && (milliTime() - startTimeMillis) / 1000 > maxSeconds) {
      setImmediate(onEnd);
    }
  });

  req.on('end', onEnd);
});

server.listen(process.env.PORT || 5000);
