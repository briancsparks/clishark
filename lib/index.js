
var sg        = require('sgsg');
var readline  = require('readline');

var _         = sg.extlibs._;
var ARGV      = sg.ARGV();

var disectors = {};
var rawLines  = [];
var data      = [];
var lineNum   = 0;

var main = function() {

  // When downstream closes (like with head or tail), cleanup
  var outputIsClosed = false;
  process.stdout.on('error', function() {
    outputIsClosed = true;
  });

  process.stdin.on('close', function(chunk) {
    outputIsClosed = true;
//    console.log(data);
  });

  var remaining = "";
  process.stdin.on('data', function(chunk) {
    if (outputIsClosed) { return; }

    var str = remaining + chunk;
    var lines = str.split('\n');
    remaining = lines.pop();
    handleLines(lines);
  });

};

function reDraw() {

  readline.cursorTo(process.stdout, 0, 0);
  readline.clearScreenDown(process.stdout);

  process.stdout.write('-----------------------------\n');

  _.each(data, function(result) {
    if (numKeys(dresult) === 0) { return; }
    var message;
    _.each(result, function(result, name) {
      if (result.message) {
        process.stdout.write(result.message.substr(0, process.stdout.columns) + '\n');
      }
    });
  });

  process.stdout.write('' + lineNum);
}

function dirty(lineNum) {
  reDraw();
}

function handleLines(lines) {
  _.each(lines, function(line) {
    handleLine(line);
  });
}

function numKeys(o) {
  if (!o) { return 0; }
  return _.keys(o).length;
}

function handleLine(line) {
  var index = rawLines.length;
  rawLines.push(line);

  lineNum += 1;

  var shark = {index: index, rawLines: rawLines, data: data};

  var disected = {}, allTags = {};
  _.each(disectors, function(disector, name) {

    var localDisected = {};
    var tags          = {};

    shark.disect = function(other_, re /*, match names*/) {
      var other   = other_ || {};
      var reNames = _.rest(arguments, 2);
      var result;

      var m, i, partName;

      if ((m = re.exec(line))) {
        result = m;
        for (i = 1; i < m.length; ++i) {
          partName = reNames[i - 1] || ''+i;
          tags[partName] = other[partName] = m[i];
        }
      }

      if (result) {
        dirty(index);
      }

      return result;
    };

    var disectorResult = disector.fn(line, shark, function() {}) || {};

    // Do we have any results?
    if (numKeys(disectorResult) === 0 && numKeys(localDisected) === 0 && numKeys(tags) === 0) { return; }

    /* otherwise -- consolidate results */
    _.extend(tags, disectorResult.tags || {}, localDisected.tags || {});

    disected[name] = _.extend(disected[name] || {}, disectorResult, localDisected);

    if (numKeys(tags) > 0) {
      disected[name].tags = _.extend(disected[name].tags || {}, tags);
      _.extend(allTags, tags);
    }

    var dis = disected[name];
    if (_.keys(dis).length > 0 && !dis.message) {
//      console.log(dis);
    }

    if (dis.message) {
      //console.log("disector " + name + " found: ", dis.message);
    }
  });

  if (disected.tags && disected.tags.length > 0) {
    disected.tags = _.extend(disected.tags || {}, allTags);
  }

//  if (numKeys(disected) === 0) {
//    disected = null;
//  }

  if (numKeys(disected) > 0) {
    data.push(disected);
  }

  // Inform the current line number we are processing
  readline.clearLine(process.stdout, -1);
  readline.moveCursor(process.stdout, -2000, 0);
  process.stdout.write('' + lineNum);
}

function registerDisector(dis) {
  var name = dis.name || 'def';
  var reg  = dis.reg  || function() {};

  disectors[name] = {
    name    : name,
    fn      : reg({})
  };

  return disectors[name];
}

registerDisector({
  name      : 'xcode_cpp',
  options   : {},
  reg       : function() {

    var currSource, sources = {};
    var found = {};

    return function(line, shark, callback) {
//      console.log("disecting: ", line);

      var m, result = {message:[]};

      var add = function(item) {
//        if (result.message.length === 0) {
//          result.message.push(found.target);
//          result.message.push(found.project);
//          result.message.push(found.config);
//        }

        result.message.push(item);
      };

      // Is this the line that tells us the project?    === BUILD TARGET test_mwp_strings OF PROJECT mario_client WITH CONFIGURATION Debug ===
      shark.disect(found, /BUILD TARGET\s+(\S+)\s+OF PROJECT\s+(\S+)\s+WITH CONFIGURATION\s+(\S+)/, 'target', 'project', 'config');

      // The invocation of the compiler
      if ((m = line.match(/clang/))) {
        if ((m = line.match(/-c\s+(\S+)\s+-/))) {
          currSource = m[1];
          sources[currSource] = {
            index   : shark.index
          };
          add(currSource);
        }
      }

      // Warnings, errors, etc         /Users/sparksb/dev/mario-develop/client/src/cpp/aprotocols/mwp_snmp.cpp:189:10: warning: unused variable 'source_port' [-Wunused-variable]
      if ((m = line.match(/^\S+:(\d+):(\d+):\s+(\S+):\s+(.*)$/))) {
        //console.log(m);
        var lineNum = m[1];
        var col  = m[2];
        var type = m[3];
        var message = m[4];
        add(lineNum);
        add(col);
        add(type);
        add(message);
        add(currSource);
      }

      if (result.message.length === 0)  { delete result.message; }
      else                              { result.message = result.message.join(" "); }

      return result;
    };
  }
});


main();

