var http = require('http')
  , URL = require('url')
  , querystring = require('querystring')
  , httpProxy = require('http-proxy');

function terminate(req, res, proxy) {
  proxy.proxyRequest(req, res, { host:'127.0.0.1', port:8999 });
}

httpProxy.createServer(function (req, res, proxy) {
  // Put your custom server logic here
  var parts = req.url.split('?');
  console.log(req.url);
  if (parts.length == 1) { terminate(req, res, proxy); return; }
  console.log(parts);
  var params = querystring.parse(parts[1]);
  console.log(params);

  if (!params.host || !params.port) {
    terminate(req, res, proxy); return;
  }

  req.headers['host'] = params.host;

  req.on('end', function() {
    console.log("sent request");
  });

  // if proxying to an ip with a host, we need to rewrite host url to this proxy e.g. for embedded resources
  if (params.ip && params.host) {
    var proxyHostURL = "127.0.0.1:8000";
    var proxyQuery = "ip=" + encodeURIComponent(params.ip) +
                     "&host=" + encodeURIComponent(params.host) + 
                     "&port=" + encodeURIComponent(params.port);
    var destHost = params.host;
    if (params.port != 80) {
      destHost += ":" + params.port;
    }
    var writeHead = res.writeHead.bind(res);
    res.writeHead = function(status, headers) {
      writeHead(status, headers);
      //console.log("status: %d: %s", status, JSON.stringify(headers));
      var ctype = headers['content-type'];
      if (ctype && ctype.match(/^text/)) {
        var write = res.write.bind(res); // override write
        var end   = res.end.bind(res);
        var buffer = new Buffer(128); // smallish for testing
        var bufferSize = 0;

        res.write = function(chunk) {
          //console.log("write: %s", chunk.toString('utf8'));
          if ((bufferSize + chunk.length) >= buffer.length) {
            // resize the buffer
            var biggerBuffer = new Buffer( (bufferSize + chunk.length) * 2);
            buffer.copy(biggerBuffer);
            delete buffer;
            buffer = biggerBuffer;
          }
          chunk.copy(buffer, bufferSize, 0);
          bufferSize += chunk.length;
          //write(buffer);
        };

        res.end = function() {
          var finalBuffer = new Buffer(bufferSize);
          buffer.copy(finalBuffer, 0, 0);
          delete buffer;
          // "<link href='http://example.com/foo.css?cc=1'/>"
          // s.replace(/example.com(.*)(["'])/g,'hello$1?foo=bar$2').replace(/(hello.*\?.*?)\?foo=bar/g,'$1&foo=bar')
          var regex = new RegExp(destHost + "(.*)([\"'])",'g');
          var restr = proxyHostURL + '$1?' + proxyQuery + '$2';
          var regex2 = new RegExp("(" + proxyHostURL + ".*\\?.*?)\\?" + proxyQuery, 'g');
          var restr2 = '$1&' + proxyQuery;
          //console.log(regex);
          //console.log(regex2);
          //console.log(restr2);
          // replace first, then handle ?
          //console.log(finalBuffer.toString('utf8').replace(regex, restr));
          //console.log(finalBuffer.toString('utf8').replace(regex, restr).replace(regex2, restr2));
          write(finalBuffer.toString('utf8').replace(regex, restr).replace(regex2, restr2) );
          console.log("end");
          end();
        }
      }
    };
  }

  proxy.proxyRequest(req, res, {
    host: (params.ip || params.host),
    port: params.port//,
 //   buffer: buffer
  });

}).listen(8000);

http.createServer(function (req, res) {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.write('Unkown endpoint' + '\n' + JSON.stringify(req.headers, true, 2));
  res.end();
}).listen(8999);

http.createServer(function (req, res) {
  var uri = URL.parse(req.url);
//  console.log(uri);
  if (uri.pathname == '/') {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.write('<html><head><title>hello</title><link type="text/css" rel="stylesheet" href="http://127.0.0.1:9000/foo.css?cc=1"/></head><body>hello</body></html>');
  }
  else {
    res.writeHead(200, { 'Content-Type': 'text/css' });
    res.write('body { background:#afa; }');
  }
    res.end();
}).listen(9000);

http.createServer(function (req, res) {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.write('proxied to server 2!' + '\n' + JSON.stringify(req.headers, true, 2));
  res.end();
}).listen(9001);

process.on("SIGINT", process.exit.bind(process));