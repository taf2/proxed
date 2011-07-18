var http = require('http')
  , URL = require('url')
  , querystring = require('querystring')
  , httpProxy = require('http-proxy');

function terminate(req, res, proxy) {
  //proxy.proxyRequest(req, res, { host:'127.0.0.1', port:8999 });
  res.writeHead(404);
  res.write('not found');
  res.end();
}

function errorInput(req, res, proxy) {
  userInput(req, res, proxy, true);
}
function userInput(req, res, proxy, error) {
  res.writeHead(200, {'Content-Type': 'text/html'});
  res.write(
  "<doctype html>" +
  "<html><head><title>Proxy Your Site</title></head><body style='margin:20px auto;width:650px'>" +
  "<form>" + (error ? "<strong style='color:red'>Must enter all 3 values for this to work</strong>" : '') + 
    "<h1>Easy Proxy Browser</h1>" +
    "<p>Ever need to set up a server with a specific hostname before you have the DNS?  Want to build and preview your site with the relase ready domain name before go live?  Enter in your servers IP, the hostname and port number to get started.</p>" + 
    "IP: <input type='text' name='ip'/>" +
    "Host Header: <input type='text' name='host'/>" +
    "Port: <input type='text' name='port'/>" +
    "<input type='submit' value='Go'/>" + 
  "</form>" +
  "<a style='float:right' href='https://github.com/taf2/proxed'>source code</a>" +
  "<script type=\"text/javascript\" src=\"https://apis.google.com/js/plusone.js\"></script><g:plusone></g:plusone>" +
  "<a href=\"http://twitter.com/share\" class=\"twitter-share-button\" data-count=\"horizontal\">Tweet</a><script type=\"text/javascript\" src=\"http://platform.twitter.com/widgets.js\"></script>" +
  "</body></html>"
  );
  res.end();
}

var port = process.env.PORT || 8000;

httpProxy.createServer(function (req, res, proxy) {
  var uri = URL.parse(req.url);
  console.log(uri);
  // handle user interface
  if (uri.pathname == '/') {
    if (uri.query) {
      var params = querystring.parse(uri.query);
      if (!params.host || !params.port || !params.ip) {
        errorInput(req, res, proxy);
      }
      else {
        res.writeHead("301", {"Location": "/" + params.ip + "/" + params.host + "/" + params.port});
        res.end();
      }
    }
    else {
      userInput(req, res, proxy, false);
    }
    return;
  }
  // start the proxy
  var parts = uri.pathname.split('/');
  while (parts[0] == '' && parts.length > 0) { parts.shift(); }
  console.log(parts);
  if (parts.length < 3) {
    terminate(req, res, proxy); return;
  }
  var params = {};
  params.ip   = parts.shift();
  params.host = parts.shift();
  params.port = parseInt(parts.shift());
  if (!params.ip || !params.host || !params.port) {
    terminate(req, res, proxy); return;
  }
  uri.pathname = parts.join('/');

  req.url = URL.format(uri);
  if (!req.url.match(/^\//)) {
    req.url = '/' + req.url;
  }
  req.headers['host'] = params.host;

  req.on('end', function() {
    console.log("sent request");
  });

  // if proxying to an ip with a host, we need to rewrite host url to this proxy e.g. for embedded resources
  if (params.ip && params.host) {
    if (process.env.NODE_ENV == 'test') {
      var proxyHostURL = "127.0.0.1:" + port;
    } else {
      var proxyHostURL = "proxed.herokuapp.com";
    }
    var proxyPathInfo = params.ip + '/' + encodeURIComponent(params.host) + '/' + params.port;
    var destHost = params.host;
    var regex = new RegExp(destHost,'g');
    if (params.port != 80) {
      destHost += ":" + params.port;
    }
    var writeHead = res.writeHead.bind(res);
    res.writeHead = function(status, headers) {
      if (status > 300 && status < 400 && headers['location']) {
        // handle a redirect, to stay inside the proxy
        if (headers['location'].match(regex)) {
          headers['location'] = headers['location'].replace(regex, proxyHostURL + '/' + proxyPathInfo);
        }
        else if (headers['location'].match(/^\//)) {
          headers['location'] = headers['location'].replace(/^\//, '/' + proxyPathInfo);
        }
        writeHead(status, headers);
        return;
      }
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
          // process buffered content with regex
          write(finalBuffer.toString('utf8').replace(regex, proxyHostURL + '/' + proxyPathInfo));
          console.log("end");
          end();
        }
      }
    };
  }

  proxy.proxyRequest(req, res, {
    host: (params.ip || params.host),
    port: params.port
  });

}).listen(port);

console.log("proxy listening on port %d", port);

if (process.env.NODE_ENV == 'test') {
  console.log("test mode: 9000, 9001");

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
    var uri = URL.parse(req.url);
    if (uri.pathname != '/') {
      res.writeHead(302, { 'Content-Type': 'text/plain', 'Location': '/' });
    }
    else {
      res.write('proxied to server 2!' + '\n' + JSON.stringify(req.headers, true, 2));
    }
    res.end();
  }).listen(9001);

  process.on("SIGINT", process.exit.bind(process));
}
