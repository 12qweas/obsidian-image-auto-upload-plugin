'use strict';

var obsidian = require('obsidian');
var node_buffer = require('node:buffer');

var pathBrowserify;
var hasRequiredPathBrowserify;

function requirePathBrowserify () {
	if (hasRequiredPathBrowserify) return pathBrowserify;
	hasRequiredPathBrowserify = 1;

	function assertPath(path) {
	  if (typeof path !== 'string') {
	    throw new TypeError('Path must be a string. Received ' + JSON.stringify(path));
	  }
	}

	// Resolves . and .. elements in a path with directory names
	function normalizeStringPosix(path, allowAboveRoot) {
	  var res = '';
	  var lastSegmentLength = 0;
	  var lastSlash = -1;
	  var dots = 0;
	  var code;
	  for (var i = 0; i <= path.length; ++i) {
	    if (i < path.length)
	      code = path.charCodeAt(i);
	    else if (code === 47 /*/*/)
	      break;
	    else
	      code = 47 /*/*/;
	    if (code === 47 /*/*/) {
	      if (lastSlash === i - 1 || dots === 1) ; else if (lastSlash !== i - 1 && dots === 2) {
	        if (res.length < 2 || lastSegmentLength !== 2 || res.charCodeAt(res.length - 1) !== 46 /*.*/ || res.charCodeAt(res.length - 2) !== 46 /*.*/) {
	          if (res.length > 2) {
	            var lastSlashIndex = res.lastIndexOf('/');
	            if (lastSlashIndex !== res.length - 1) {
	              if (lastSlashIndex === -1) {
	                res = '';
	                lastSegmentLength = 0;
	              } else {
	                res = res.slice(0, lastSlashIndex);
	                lastSegmentLength = res.length - 1 - res.lastIndexOf('/');
	              }
	              lastSlash = i;
	              dots = 0;
	              continue;
	            }
	          } else if (res.length === 2 || res.length === 1) {
	            res = '';
	            lastSegmentLength = 0;
	            lastSlash = i;
	            dots = 0;
	            continue;
	          }
	        }
	        if (allowAboveRoot) {
	          if (res.length > 0)
	            res += '/..';
	          else
	            res = '..';
	          lastSegmentLength = 2;
	        }
	      } else {
	        if (res.length > 0)
	          res += '/' + path.slice(lastSlash + 1, i);
	        else
	          res = path.slice(lastSlash + 1, i);
	        lastSegmentLength = i - lastSlash - 1;
	      }
	      lastSlash = i;
	      dots = 0;
	    } else if (code === 46 /*.*/ && dots !== -1) {
	      ++dots;
	    } else {
	      dots = -1;
	    }
	  }
	  return res;
	}

	function _format(sep, pathObject) {
	  var dir = pathObject.dir || pathObject.root;
	  var base = pathObject.base || (pathObject.name || '') + (pathObject.ext || '');
	  if (!dir) {
	    return base;
	  }
	  if (dir === pathObject.root) {
	    return dir + base;
	  }
	  return dir + sep + base;
	}

	var posix = {
	  // path.resolve([from ...], to)
	  resolve: function resolve() {
	    var resolvedPath = '';
	    var resolvedAbsolute = false;
	    var cwd;

	    for (var i = arguments.length - 1; i >= -1 && !resolvedAbsolute; i--) {
	      var path;
	      if (i >= 0)
	        path = arguments[i];
	      else {
	        if (cwd === undefined)
	          cwd = process.cwd();
	        path = cwd;
	      }

	      assertPath(path);

	      // Skip empty entries
	      if (path.length === 0) {
	        continue;
	      }

	      resolvedPath = path + '/' + resolvedPath;
	      resolvedAbsolute = path.charCodeAt(0) === 47 /*/*/;
	    }

	    // At this point the path should be resolved to a full absolute path, but
	    // handle relative paths to be safe (might happen when process.cwd() fails)

	    // Normalize the path
	    resolvedPath = normalizeStringPosix(resolvedPath, !resolvedAbsolute);

	    if (resolvedAbsolute) {
	      if (resolvedPath.length > 0)
	        return '/' + resolvedPath;
	      else
	        return '/';
	    } else if (resolvedPath.length > 0) {
	      return resolvedPath;
	    } else {
	      return '.';
	    }
	  },

	  normalize: function normalize(path) {
	    assertPath(path);

	    if (path.length === 0) return '.';

	    var isAbsolute = path.charCodeAt(0) === 47 /*/*/;
	    var trailingSeparator = path.charCodeAt(path.length - 1) === 47 /*/*/;

	    // Normalize the path
	    path = normalizeStringPosix(path, !isAbsolute);

	    if (path.length === 0 && !isAbsolute) path = '.';
	    if (path.length > 0 && trailingSeparator) path += '/';

	    if (isAbsolute) return '/' + path;
	    return path;
	  },

	  isAbsolute: function isAbsolute(path) {
	    assertPath(path);
	    return path.length > 0 && path.charCodeAt(0) === 47 /*/*/;
	  },

	  join: function join() {
	    if (arguments.length === 0)
	      return '.';
	    var joined;
	    for (var i = 0; i < arguments.length; ++i) {
	      var arg = arguments[i];
	      assertPath(arg);
	      if (arg.length > 0) {
	        if (joined === undefined)
	          joined = arg;
	        else
	          joined += '/' + arg;
	      }
	    }
	    if (joined === undefined)
	      return '.';
	    return posix.normalize(joined);
	  },

	  relative: function relative(from, to) {
	    assertPath(from);
	    assertPath(to);

	    if (from === to) return '';

	    from = posix.resolve(from);
	    to = posix.resolve(to);

	    if (from === to) return '';

	    // Trim any leading backslashes
	    var fromStart = 1;
	    for (; fromStart < from.length; ++fromStart) {
	      if (from.charCodeAt(fromStart) !== 47 /*/*/)
	        break;
	    }
	    var fromEnd = from.length;
	    var fromLen = fromEnd - fromStart;

	    // Trim any leading backslashes
	    var toStart = 1;
	    for (; toStart < to.length; ++toStart) {
	      if (to.charCodeAt(toStart) !== 47 /*/*/)
	        break;
	    }
	    var toEnd = to.length;
	    var toLen = toEnd - toStart;

	    // Compare paths to find the longest common path from root
	    var length = fromLen < toLen ? fromLen : toLen;
	    var lastCommonSep = -1;
	    var i = 0;
	    for (; i <= length; ++i) {
	      if (i === length) {
	        if (toLen > length) {
	          if (to.charCodeAt(toStart + i) === 47 /*/*/) {
	            // We get here if `from` is the exact base path for `to`.
	            // For example: from='/foo/bar'; to='/foo/bar/baz'
	            return to.slice(toStart + i + 1);
	          } else if (i === 0) {
	            // We get here if `from` is the root
	            // For example: from='/'; to='/foo'
	            return to.slice(toStart + i);
	          }
	        } else if (fromLen > length) {
	          if (from.charCodeAt(fromStart + i) === 47 /*/*/) {
	            // We get here if `to` is the exact base path for `from`.
	            // For example: from='/foo/bar/baz'; to='/foo/bar'
	            lastCommonSep = i;
	          } else if (i === 0) {
	            // We get here if `to` is the root.
	            // For example: from='/foo'; to='/'
	            lastCommonSep = 0;
	          }
	        }
	        break;
	      }
	      var fromCode = from.charCodeAt(fromStart + i);
	      var toCode = to.charCodeAt(toStart + i);
	      if (fromCode !== toCode)
	        break;
	      else if (fromCode === 47 /*/*/)
	        lastCommonSep = i;
	    }

	    var out = '';
	    // Generate the relative path based on the path difference between `to`
	    // and `from`
	    for (i = fromStart + lastCommonSep + 1; i <= fromEnd; ++i) {
	      if (i === fromEnd || from.charCodeAt(i) === 47 /*/*/) {
	        if (out.length === 0)
	          out += '..';
	        else
	          out += '/..';
	      }
	    }

	    // Lastly, append the rest of the destination (`to`) path that comes after
	    // the common path parts
	    if (out.length > 0)
	      return out + to.slice(toStart + lastCommonSep);
	    else {
	      toStart += lastCommonSep;
	      if (to.charCodeAt(toStart) === 47 /*/*/)
	        ++toStart;
	      return to.slice(toStart);
	    }
	  },

	  _makeLong: function _makeLong(path) {
	    return path;
	  },

	  dirname: function dirname(path) {
	    assertPath(path);
	    if (path.length === 0) return '.';
	    var code = path.charCodeAt(0);
	    var hasRoot = code === 47 /*/*/;
	    var end = -1;
	    var matchedSlash = true;
	    for (var i = path.length - 1; i >= 1; --i) {
	      code = path.charCodeAt(i);
	      if (code === 47 /*/*/) {
	          if (!matchedSlash) {
	            end = i;
	            break;
	          }
	        } else {
	        // We saw the first non-path separator
	        matchedSlash = false;
	      }
	    }

	    if (end === -1) return hasRoot ? '/' : '.';
	    if (hasRoot && end === 1) return '//';
	    return path.slice(0, end);
	  },

	  basename: function basename(path, ext) {
	    if (ext !== undefined && typeof ext !== 'string') throw new TypeError('"ext" argument must be a string');
	    assertPath(path);

	    var start = 0;
	    var end = -1;
	    var matchedSlash = true;
	    var i;

	    if (ext !== undefined && ext.length > 0 && ext.length <= path.length) {
	      if (ext.length === path.length && ext === path) return '';
	      var extIdx = ext.length - 1;
	      var firstNonSlashEnd = -1;
	      for (i = path.length - 1; i >= 0; --i) {
	        var code = path.charCodeAt(i);
	        if (code === 47 /*/*/) {
	            // If we reached a path separator that was not part of a set of path
	            // separators at the end of the string, stop now
	            if (!matchedSlash) {
	              start = i + 1;
	              break;
	            }
	          } else {
	          if (firstNonSlashEnd === -1) {
	            // We saw the first non-path separator, remember this index in case
	            // we need it if the extension ends up not matching
	            matchedSlash = false;
	            firstNonSlashEnd = i + 1;
	          }
	          if (extIdx >= 0) {
	            // Try to match the explicit extension
	            if (code === ext.charCodeAt(extIdx)) {
	              if (--extIdx === -1) {
	                // We matched the extension, so mark this as the end of our path
	                // component
	                end = i;
	              }
	            } else {
	              // Extension does not match, so our result is the entire path
	              // component
	              extIdx = -1;
	              end = firstNonSlashEnd;
	            }
	          }
	        }
	      }

	      if (start === end) end = firstNonSlashEnd;else if (end === -1) end = path.length;
	      return path.slice(start, end);
	    } else {
	      for (i = path.length - 1; i >= 0; --i) {
	        if (path.charCodeAt(i) === 47 /*/*/) {
	            // If we reached a path separator that was not part of a set of path
	            // separators at the end of the string, stop now
	            if (!matchedSlash) {
	              start = i + 1;
	              break;
	            }
	          } else if (end === -1) {
	          // We saw the first non-path separator, mark this as the end of our
	          // path component
	          matchedSlash = false;
	          end = i + 1;
	        }
	      }

	      if (end === -1) return '';
	      return path.slice(start, end);
	    }
	  },

	  extname: function extname(path) {
	    assertPath(path);
	    var startDot = -1;
	    var startPart = 0;
	    var end = -1;
	    var matchedSlash = true;
	    // Track the state of characters (if any) we see before our first dot and
	    // after any path separator we find
	    var preDotState = 0;
	    for (var i = path.length - 1; i >= 0; --i) {
	      var code = path.charCodeAt(i);
	      if (code === 47 /*/*/) {
	          // If we reached a path separator that was not part of a set of path
	          // separators at the end of the string, stop now
	          if (!matchedSlash) {
	            startPart = i + 1;
	            break;
	          }
	          continue;
	        }
	      if (end === -1) {
	        // We saw the first non-path separator, mark this as the end of our
	        // extension
	        matchedSlash = false;
	        end = i + 1;
	      }
	      if (code === 46 /*.*/) {
	          // If this is our first dot, mark it as the start of our extension
	          if (startDot === -1)
	            startDot = i;
	          else if (preDotState !== 1)
	            preDotState = 1;
	      } else if (startDot !== -1) {
	        // We saw a non-dot and non-path separator before our dot, so we should
	        // have a good chance at having a non-empty extension
	        preDotState = -1;
	      }
	    }

	    if (startDot === -1 || end === -1 ||
	        // We saw a non-dot character immediately before the dot
	        preDotState === 0 ||
	        // The (right-most) trimmed path component is exactly '..'
	        preDotState === 1 && startDot === end - 1 && startDot === startPart + 1) {
	      return '';
	    }
	    return path.slice(startDot, end);
	  },

	  format: function format(pathObject) {
	    if (pathObject === null || typeof pathObject !== 'object') {
	      throw new TypeError('The "pathObject" argument must be of type Object. Received type ' + typeof pathObject);
	    }
	    return _format('/', pathObject);
	  },

	  parse: function parse(path) {
	    assertPath(path);

	    var ret = { root: '', dir: '', base: '', ext: '', name: '' };
	    if (path.length === 0) return ret;
	    var code = path.charCodeAt(0);
	    var isAbsolute = code === 47 /*/*/;
	    var start;
	    if (isAbsolute) {
	      ret.root = '/';
	      start = 1;
	    } else {
	      start = 0;
	    }
	    var startDot = -1;
	    var startPart = 0;
	    var end = -1;
	    var matchedSlash = true;
	    var i = path.length - 1;

	    // Track the state of characters (if any) we see before our first dot and
	    // after any path separator we find
	    var preDotState = 0;

	    // Get non-dir info
	    for (; i >= start; --i) {
	      code = path.charCodeAt(i);
	      if (code === 47 /*/*/) {
	          // If we reached a path separator that was not part of a set of path
	          // separators at the end of the string, stop now
	          if (!matchedSlash) {
	            startPart = i + 1;
	            break;
	          }
	          continue;
	        }
	      if (end === -1) {
	        // We saw the first non-path separator, mark this as the end of our
	        // extension
	        matchedSlash = false;
	        end = i + 1;
	      }
	      if (code === 46 /*.*/) {
	          // If this is our first dot, mark it as the start of our extension
	          if (startDot === -1) startDot = i;else if (preDotState !== 1) preDotState = 1;
	        } else if (startDot !== -1) {
	        // We saw a non-dot and non-path separator before our dot, so we should
	        // have a good chance at having a non-empty extension
	        preDotState = -1;
	      }
	    }

	    if (startDot === -1 || end === -1 ||
	    // We saw a non-dot character immediately before the dot
	    preDotState === 0 ||
	    // The (right-most) trimmed path component is exactly '..'
	    preDotState === 1 && startDot === end - 1 && startDot === startPart + 1) {
	      if (end !== -1) {
	        if (startPart === 0 && isAbsolute) ret.base = ret.name = path.slice(1, end);else ret.base = ret.name = path.slice(startPart, end);
	      }
	    } else {
	      if (startPart === 0 && isAbsolute) {
	        ret.name = path.slice(1, startDot);
	        ret.base = path.slice(1, end);
	      } else {
	        ret.name = path.slice(startPart, startDot);
	        ret.base = path.slice(startPart, end);
	      }
	      ret.ext = path.slice(startDot, end);
	    }

	    if (startPart > 0) ret.dir = path.slice(0, startPart - 1);else if (isAbsolute) ret.dir = '/';

	    return ret;
	  },

	  sep: '/',
	  delimiter: ':',
	  win32: null,
	  posix: null
	};

	posix.posix = posix;

	pathBrowserify = posix;
	return pathBrowserify;
}

var pathBrowserifyExports = requirePathBrowserify();

const IMAGE_EXT_LIST = [
    ".png",
    ".jpg",
    ".jpeg",
    ".bmp",
    ".gif",
    ".svg",
    ".tiff",
    ".webp",
    ".avif",
];
function isAnImage(ext) {
    return IMAGE_EXT_LIST.includes(ext.toLowerCase());
}
function isAssetTypeAnImage(path) {
    return isAnImage(pathBrowserifyExports.extname(path));
}
async function streamToString(stream) {
    const chunks = [];
    for await (const chunk of stream) {
        chunks.push(Buffer.from(chunk));
    }
    // @ts-ignore
    return Buffer.concat(chunks).toString("utf-8");
}
function getUrlAsset(url) {
    return (url = url.substr(1 + url.lastIndexOf("/")).split("?")[0]).split("#")[0];
}
function getLastImage(list) {
    const reversedList = list.reverse();
    let lastImage;
    reversedList.forEach(item => {
        if (item && item.startsWith("http")) {
            lastImage = item;
            return item;
        }
    });
    return lastImage;
}
function arrayToObject(arr, key) {
    const obj = {};
    arr.forEach(element => {
        obj[element[key]] = element;
    });
    return obj;
}
function bufferToArrayBuffer(buffer) {
    const arrayBuffer = new ArrayBuffer(buffer.length);
    const view = new Uint8Array(arrayBuffer);
    for (let i = 0; i < buffer.length; i++) {
        view[i] = buffer[i];
    }
    return arrayBuffer;
}
function uuid() {
    return Math.random().toString(36).slice(2);
}

// Primitive types
function dv(array) {
    return new DataView(array.buffer, array.byteOffset);
}
/**
 * 8-bit unsigned integer
 */
const UINT8 = {
    len: 1,
    get(array, offset) {
        return dv(array).getUint8(offset);
    },
    put(array, offset, value) {
        dv(array).setUint8(offset, value);
        return offset + 1;
    }
};
/**
 * 16-bit unsigned integer, Little Endian byte order
 */
const UINT16_LE = {
    len: 2,
    get(array, offset) {
        return dv(array).getUint16(offset, true);
    },
    put(array, offset, value) {
        dv(array).setUint16(offset, value, true);
        return offset + 2;
    }
};
/**
 * 16-bit unsigned integer, Big Endian byte order
 */
const UINT16_BE = {
    len: 2,
    get(array, offset) {
        return dv(array).getUint16(offset);
    },
    put(array, offset, value) {
        dv(array).setUint16(offset, value);
        return offset + 2;
    }
};
/**
 * 32-bit unsigned integer, Little Endian byte order
 */
const UINT32_LE = {
    len: 4,
    get(array, offset) {
        return dv(array).getUint32(offset, true);
    },
    put(array, offset, value) {
        dv(array).setUint32(offset, value, true);
        return offset + 4;
    }
};
/**
 * 32-bit unsigned integer, Big Endian byte order
 */
const UINT32_BE = {
    len: 4,
    get(array, offset) {
        return dv(array).getUint32(offset);
    },
    put(array, offset, value) {
        dv(array).setUint32(offset, value);
        return offset + 4;
    }
};
/**
 * 32-bit signed integer, Big Endian byte order
 */
const INT32_BE = {
    len: 4,
    get(array, offset) {
        return dv(array).getInt32(offset);
    },
    put(array, offset, value) {
        dv(array).setInt32(offset, value);
        return offset + 4;
    }
};
/**
 * 64-bit unsigned integer, Little Endian byte order
 */
const UINT64_LE = {
    len: 8,
    get(array, offset) {
        return dv(array).getBigUint64(offset, true);
    },
    put(array, offset, value) {
        dv(array).setBigUint64(offset, value, true);
        return offset + 8;
    }
};
/**
 * Consume a fixed number of bytes from the stream and return a string with a specified encoding.
 */
class StringType {
    constructor(len, encoding) {
        this.len = len;
        this.encoding = encoding;
    }
    get(uint8Array, offset) {
        return node_buffer.Buffer.from(uint8Array).toString(this.encoding, offset, offset + this.len);
    }
}

const defaultMessages = 'End-Of-Stream';
/**
 * Thrown on read operation of the end of file or stream has been reached
 */
class EndOfStreamError extends Error {
    constructor() {
        super(defaultMessages);
    }
}

class Deferred {
    constructor() {
        this.resolve = () => null;
        this.reject = () => null;
        this.promise = new Promise((resolve, reject) => {
            this.reject = reject;
            this.resolve = resolve;
        });
    }
}

class AbstractStreamReader {
    constructor() {
        /**
         * Maximum request length on read-stream operation
         */
        this.maxStreamReadSize = 1 * 1024 * 1024;
        this.endOfStream = false;
        /**
         * Store peeked data
         * @type {Array}
         */
        this.peekQueue = [];
    }
    async peek(uint8Array, offset, length) {
        const bytesRead = await this.read(uint8Array, offset, length);
        this.peekQueue.push(uint8Array.subarray(offset, offset + bytesRead)); // Put read data back to peek buffer
        return bytesRead;
    }
    async read(buffer, offset, length) {
        if (length === 0) {
            return 0;
        }
        let bytesRead = this.readFromPeekBuffer(buffer, offset, length);
        bytesRead += await this.readRemainderFromStream(buffer, offset + bytesRead, length - bytesRead);
        if (bytesRead === 0) {
            throw new EndOfStreamError();
        }
        return bytesRead;
    }
    /**
     * Read chunk from stream
     * @param buffer - Target Uint8Array (or Buffer) to store data read from stream in
     * @param offset - Offset target
     * @param length - Number of bytes to read
     * @returns Number of bytes read
     */
    readFromPeekBuffer(buffer, offset, length) {
        let remaining = length;
        let bytesRead = 0;
        // consume peeked data first
        while (this.peekQueue.length > 0 && remaining > 0) {
            const peekData = this.peekQueue.pop(); // Front of queue
            if (!peekData)
                throw new Error('peekData should be defined');
            const lenCopy = Math.min(peekData.length, remaining);
            buffer.set(peekData.subarray(0, lenCopy), offset + bytesRead);
            bytesRead += lenCopy;
            remaining -= lenCopy;
            if (lenCopy < peekData.length) {
                // remainder back to queue
                this.peekQueue.push(peekData.subarray(lenCopy));
            }
        }
        return bytesRead;
    }
    async readRemainderFromStream(buffer, offset, initialRemaining) {
        let remaining = initialRemaining;
        let bytesRead = 0;
        // Continue reading from stream if required
        while (remaining > 0 && !this.endOfStream) {
            const reqLen = Math.min(remaining, this.maxStreamReadSize);
            const chunkLen = await this.readFromStream(buffer, offset + bytesRead, reqLen);
            if (chunkLen === 0)
                break;
            bytesRead += chunkLen;
            remaining -= chunkLen;
        }
        return bytesRead;
    }
}

/**
 * Node.js Readable Stream Reader
 * Ref: https://nodejs.org/api/stream.html#readable-streams
 */
class StreamReader extends AbstractStreamReader {
    constructor(s) {
        super();
        this.s = s;
        /**
         * Deferred used for postponed read request (as not data is yet available to read)
         */
        this.deferred = null;
        if (!s.read || !s.once) {
            throw new Error('Expected an instance of stream.Readable');
        }
        this.s.once('end', () => this.reject(new EndOfStreamError()));
        this.s.once('error', err => this.reject(err));
        this.s.once('close', () => this.reject(new Error('Stream closed')));
    }
    /**
     * Read chunk from stream
     * @param buffer Target Uint8Array (or Buffer) to store data read from stream in
     * @param offset Offset target
     * @param length Number of bytes to read
     * @returns Number of bytes read
     */
    async readFromStream(buffer, offset, length) {
        if (this.endOfStream) {
            return 0;
        }
        const readBuffer = this.s.read(length);
        if (readBuffer) {
            buffer.set(readBuffer, offset);
            return readBuffer.length;
        }
        const request = {
            buffer,
            offset,
            length,
            deferred: new Deferred()
        };
        this.deferred = request.deferred;
        this.s.once('readable', () => {
            this.readDeferred(request);
        });
        return request.deferred.promise;
    }
    /**
     * Process deferred read request
     * @param request Deferred read request
     */
    readDeferred(request) {
        const readBuffer = this.s.read(request.length);
        if (readBuffer) {
            request.buffer.set(readBuffer, request.offset);
            request.deferred.resolve(readBuffer.length);
            this.deferred = null;
        }
        else {
            this.s.once('readable', () => {
                this.readDeferred(request);
            });
        }
    }
    reject(err) {
        this.endOfStream = true;
        if (this.deferred) {
            this.deferred.reject(err);
            this.deferred = null;
        }
    }
    async abort() {
        this.s.destroy();
    }
}

/**
 * Core tokenizer
 */
class AbstractTokenizer {
    constructor(fileInfo) {
        /**
         * Tokenizer-stream position
         */
        this.position = 0;
        this.numBuffer = new Uint8Array(8);
        this.fileInfo = fileInfo ? fileInfo : {};
    }
    /**
     * Read a token from the tokenizer-stream
     * @param token - The token to read
     * @param position - If provided, the desired position in the tokenizer-stream
     * @returns Promise with token data
     */
    async readToken(token, position = this.position) {
        const uint8Array = new Uint8Array(token.len);
        const len = await this.readBuffer(uint8Array, { position });
        if (len < token.len)
            throw new EndOfStreamError();
        return token.get(uint8Array, 0);
    }
    /**
     * Peek a token from the tokenizer-stream.
     * @param token - Token to peek from the tokenizer-stream.
     * @param position - Offset where to begin reading within the file. If position is null, data will be read from the current file position.
     * @returns Promise with token data
     */
    async peekToken(token, position = this.position) {
        const uint8Array = new Uint8Array(token.len);
        const len = await this.peekBuffer(uint8Array, { position });
        if (len < token.len)
            throw new EndOfStreamError();
        return token.get(uint8Array, 0);
    }
    /**
     * Read a numeric token from the stream
     * @param token - Numeric token
     * @returns Promise with number
     */
    async readNumber(token) {
        const len = await this.readBuffer(this.numBuffer, { length: token.len });
        if (len < token.len)
            throw new EndOfStreamError();
        return token.get(this.numBuffer, 0);
    }
    /**
     * Read a numeric token from the stream
     * @param token - Numeric token
     * @returns Promise with number
     */
    async peekNumber(token) {
        const len = await this.peekBuffer(this.numBuffer, { length: token.len });
        if (len < token.len)
            throw new EndOfStreamError();
        return token.get(this.numBuffer, 0);
    }
    /**
     * Ignore number of bytes, advances the pointer in under tokenizer-stream.
     * @param length - Number of bytes to ignore
     * @return resolves the number of bytes ignored, equals length if this available, otherwise the number of bytes available
     */
    async ignore(length) {
        if (this.fileInfo.size !== undefined) {
            const bytesLeft = this.fileInfo.size - this.position;
            if (length > bytesLeft) {
                this.position += bytesLeft;
                return bytesLeft;
            }
        }
        this.position += length;
        return length;
    }
    async close() {
        // empty
    }
    normalizeOptions(uint8Array, options) {
        if (options && options.position !== undefined && options.position < this.position) {
            throw new Error('`options.position` must be equal or greater than `tokenizer.position`');
        }
        if (options) {
            return {
                mayBeLess: options.mayBeLess === true,
                offset: options.offset ? options.offset : 0,
                length: options.length ? options.length : (uint8Array.length - (options.offset ? options.offset : 0)),
                position: options.position ? options.position : this.position
            };
        }
        return {
            mayBeLess: false,
            offset: 0,
            length: uint8Array.length,
            position: this.position
        };
    }
}

const maxBufferSize = 256000;
class ReadStreamTokenizer extends AbstractTokenizer {
    constructor(streamReader, fileInfo) {
        super(fileInfo);
        this.streamReader = streamReader;
    }
    /**
     * Get file information, an HTTP-client may implement this doing a HEAD request
     * @return Promise with file information
     */
    async getFileInfo() {
        return this.fileInfo;
    }
    /**
     * Read buffer from tokenizer
     * @param uint8Array - Target Uint8Array to fill with data read from the tokenizer-stream
     * @param options - Read behaviour options
     * @returns Promise with number of bytes read
     */
    async readBuffer(uint8Array, options) {
        const normOptions = this.normalizeOptions(uint8Array, options);
        const skipBytes = normOptions.position - this.position;
        if (skipBytes > 0) {
            await this.ignore(skipBytes);
            return this.readBuffer(uint8Array, options);
        }
        else if (skipBytes < 0) {
            throw new Error('`options.position` must be equal or greater than `tokenizer.position`');
        }
        if (normOptions.length === 0) {
            return 0;
        }
        const bytesRead = await this.streamReader.read(uint8Array, normOptions.offset, normOptions.length);
        this.position += bytesRead;
        if ((!options || !options.mayBeLess) && bytesRead < normOptions.length) {
            throw new EndOfStreamError();
        }
        return bytesRead;
    }
    /**
     * Peek (read ahead) buffer from tokenizer
     * @param uint8Array - Uint8Array (or Buffer) to write data to
     * @param options - Read behaviour options
     * @returns Promise with number of bytes peeked
     */
    async peekBuffer(uint8Array, options) {
        const normOptions = this.normalizeOptions(uint8Array, options);
        let bytesRead = 0;
        if (normOptions.position) {
            const skipBytes = normOptions.position - this.position;
            if (skipBytes > 0) {
                const skipBuffer = new Uint8Array(normOptions.length + skipBytes);
                bytesRead = await this.peekBuffer(skipBuffer, { mayBeLess: normOptions.mayBeLess });
                uint8Array.set(skipBuffer.subarray(skipBytes), normOptions.offset);
                return bytesRead - skipBytes;
            }
            else if (skipBytes < 0) {
                throw new Error('Cannot peek from a negative offset in a stream');
            }
        }
        if (normOptions.length > 0) {
            try {
                bytesRead = await this.streamReader.peek(uint8Array, normOptions.offset, normOptions.length);
            }
            catch (err) {
                if (options && options.mayBeLess && err instanceof EndOfStreamError) {
                    return 0;
                }
                throw err;
            }
            if ((!normOptions.mayBeLess) && bytesRead < normOptions.length) {
                throw new EndOfStreamError();
            }
        }
        return bytesRead;
    }
    async ignore(length) {
        // debug(`ignore ${this.position}...${this.position + length - 1}`);
        const bufSize = Math.min(maxBufferSize, length);
        const buf = new Uint8Array(bufSize);
        let totBytesRead = 0;
        while (totBytesRead < length) {
            const remaining = length - totBytesRead;
            const bytesRead = await this.readBuffer(buf, { length: Math.min(bufSize, remaining) });
            if (bytesRead < 0) {
                return bytesRead;
            }
            totBytesRead += bytesRead;
        }
        return totBytesRead;
    }
}

class BufferTokenizer extends AbstractTokenizer {
    /**
     * Construct BufferTokenizer
     * @param uint8Array - Uint8Array to tokenize
     * @param fileInfo - Pass additional file information to the tokenizer
     */
    constructor(uint8Array, fileInfo) {
        super(fileInfo);
        this.uint8Array = uint8Array;
        this.fileInfo.size = this.fileInfo.size ? this.fileInfo.size : uint8Array.length;
    }
    /**
     * Read buffer from tokenizer
     * @param uint8Array - Uint8Array to tokenize
     * @param options - Read behaviour options
     * @returns {Promise<number>}
     */
    async readBuffer(uint8Array, options) {
        if (options && options.position) {
            if (options.position < this.position) {
                throw new Error('`options.position` must be equal or greater than `tokenizer.position`');
            }
            this.position = options.position;
        }
        const bytesRead = await this.peekBuffer(uint8Array, options);
        this.position += bytesRead;
        return bytesRead;
    }
    /**
     * Peek (read ahead) buffer from tokenizer
     * @param uint8Array
     * @param options - Read behaviour options
     * @returns {Promise<number>}
     */
    async peekBuffer(uint8Array, options) {
        const normOptions = this.normalizeOptions(uint8Array, options);
        const bytes2read = Math.min(this.uint8Array.length - normOptions.position, normOptions.length);
        if ((!normOptions.mayBeLess) && bytes2read < normOptions.length) {
            throw new EndOfStreamError();
        }
        else {
            uint8Array.set(this.uint8Array.subarray(normOptions.position, normOptions.position + bytes2read), normOptions.offset);
            return bytes2read;
        }
    }
    async close() {
        // empty
    }
}

/**
 * Construct ReadStreamTokenizer from given Stream.
 * Will set fileSize, if provided given Stream has set the .path property/
 * @param stream - Read from Node.js Stream.Readable
 * @param fileInfo - Pass the file information, like size and MIME-type of the corresponding stream.
 * @returns ReadStreamTokenizer
 */
function fromStream(stream, fileInfo) {
    fileInfo = fileInfo ? fileInfo : {};
    return new ReadStreamTokenizer(new StreamReader(stream), fileInfo);
}
/**
 * Construct ReadStreamTokenizer from given Buffer.
 * @param uint8Array - Uint8Array to tokenize
 * @param fileInfo - Pass additional file information to the tokenizer
 * @returns BufferTokenizer
 */
function fromBuffer(uint8Array, fileInfo) {
    return new BufferTokenizer(uint8Array, fileInfo);
}

function stringToBytes(string) {
	return [...string].map(character => character.charCodeAt(0)); // eslint-disable-line unicorn/prefer-code-point
}

/**
Checks whether the TAR checksum is valid.

@param {Buffer} buffer - The TAR header `[offset ... offset + 512]`.
@param {number} offset - TAR header offset.
@returns {boolean} `true` if the TAR checksum is valid, otherwise `false`.
*/
function tarHeaderChecksumMatches(buffer, offset = 0) {
	const readSum = Number.parseInt(buffer.toString('utf8', 148, 154).replace(/\0.*$/, '').trim(), 8); // Read sum in header
	if (Number.isNaN(readSum)) {
		return false;
	}

	let sum = 8 * 0x20; // Initialize signed bit sum

	for (let index = offset; index < offset + 148; index++) {
		sum += buffer[index];
	}

	for (let index = offset + 156; index < offset + 512; index++) {
		sum += buffer[index];
	}

	return readSum === sum;
}

/**
ID3 UINT32 sync-safe tokenizer token.
28 bits (representing up to 256MB) integer, the msb is 0 to avoid "false syncsignals".
*/
const uint32SyncSafeToken = {
	get: (buffer, offset) => (buffer[offset + 3] & 0x7F) | ((buffer[offset + 2]) << 7) | ((buffer[offset + 1]) << 14) | ((buffer[offset]) << 21),
	len: 4,
};

const extensions = [
	'jpg',
	'png',
	'apng',
	'gif',
	'webp',
	'flif',
	'xcf',
	'cr2',
	'cr3',
	'orf',
	'arw',
	'dng',
	'nef',
	'rw2',
	'raf',
	'tif',
	'bmp',
	'icns',
	'jxr',
	'psd',
	'indd',
	'zip',
	'tar',
	'rar',
	'gz',
	'bz2',
	'7z',
	'dmg',
	'mp4',
	'mid',
	'mkv',
	'webm',
	'mov',
	'avi',
	'mpg',
	'mp2',
	'mp3',
	'm4a',
	'oga',
	'ogg',
	'ogv',
	'opus',
	'flac',
	'wav',
	'spx',
	'amr',
	'pdf',
	'epub',
	'elf',
	'macho',
	'exe',
	'swf',
	'rtf',
	'wasm',
	'woff',
	'woff2',
	'eot',
	'ttf',
	'otf',
	'ico',
	'flv',
	'ps',
	'xz',
	'sqlite',
	'nes',
	'crx',
	'xpi',
	'cab',
	'deb',
	'ar',
	'rpm',
	'Z',
	'lz',
	'cfb',
	'mxf',
	'mts',
	'blend',
	'bpg',
	'docx',
	'pptx',
	'xlsx',
	'3gp',
	'3g2',
	'j2c',
	'jp2',
	'jpm',
	'jpx',
	'mj2',
	'aif',
	'qcp',
	'odt',
	'ods',
	'odp',
	'xml',
	'mobi',
	'heic',
	'cur',
	'ktx',
	'ape',
	'wv',
	'dcm',
	'ics',
	'glb',
	'pcap',
	'dsf',
	'lnk',
	'alias',
	'voc',
	'ac3',
	'm4v',
	'm4p',
	'm4b',
	'f4v',
	'f4p',
	'f4b',
	'f4a',
	'mie',
	'asf',
	'ogm',
	'ogx',
	'mpc',
	'arrow',
	'shp',
	'aac',
	'mp1',
	'it',
	's3m',
	'xm',
	'ai',
	'skp',
	'avif',
	'eps',
	'lzh',
	'pgp',
	'asar',
	'stl',
	'chm',
	'3mf',
	'zst',
	'jxl',
	'vcf',
	'jls',
	'pst',
	'dwg',
	'parquet',
	'class',
	'arj',
	'cpio',
	'ace',
	'avro',
	'icc',
	'fbx',
];

const mimeTypes = [
	'image/jpeg',
	'image/png',
	'image/gif',
	'image/webp',
	'image/flif',
	'image/x-xcf',
	'image/x-canon-cr2',
	'image/x-canon-cr3',
	'image/tiff',
	'image/bmp',
	'image/vnd.ms-photo',
	'image/vnd.adobe.photoshop',
	'application/x-indesign',
	'application/epub+zip',
	'application/x-xpinstall',
	'application/vnd.oasis.opendocument.text',
	'application/vnd.oasis.opendocument.spreadsheet',
	'application/vnd.oasis.opendocument.presentation',
	'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
	'application/vnd.openxmlformats-officedocument.presentationml.presentation',
	'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
	'application/zip',
	'application/x-tar',
	'application/x-rar-compressed',
	'application/gzip',
	'application/x-bzip2',
	'application/x-7z-compressed',
	'application/x-apple-diskimage',
	'application/x-apache-arrow',
	'video/mp4',
	'audio/midi',
	'video/x-matroska',
	'video/webm',
	'video/quicktime',
	'video/vnd.avi',
	'audio/vnd.wave',
	'audio/qcelp',
	'audio/x-ms-asf',
	'video/x-ms-asf',
	'application/vnd.ms-asf',
	'video/mpeg',
	'video/3gpp',
	'audio/mpeg',
	'audio/mp4', // RFC 4337
	'audio/opus',
	'video/ogg',
	'audio/ogg',
	'application/ogg',
	'audio/x-flac',
	'audio/ape',
	'audio/wavpack',
	'audio/amr',
	'application/pdf',
	'application/x-elf',
	'application/x-mach-binary',
	'application/x-msdownload',
	'application/x-shockwave-flash',
	'application/rtf',
	'application/wasm',
	'font/woff',
	'font/woff2',
	'application/vnd.ms-fontobject',
	'font/ttf',
	'font/otf',
	'image/x-icon',
	'video/x-flv',
	'application/postscript',
	'application/eps',
	'application/x-xz',
	'application/x-sqlite3',
	'application/x-nintendo-nes-rom',
	'application/x-google-chrome-extension',
	'application/vnd.ms-cab-compressed',
	'application/x-deb',
	'application/x-unix-archive',
	'application/x-rpm',
	'application/x-compress',
	'application/x-lzip',
	'application/x-cfb',
	'application/x-mie',
	'application/mxf',
	'video/mp2t',
	'application/x-blender',
	'image/bpg',
	'image/j2c',
	'image/jp2',
	'image/jpx',
	'image/jpm',
	'image/mj2',
	'audio/aiff',
	'application/xml',
	'application/x-mobipocket-ebook',
	'image/heif',
	'image/heif-sequence',
	'image/heic',
	'image/heic-sequence',
	'image/icns',
	'image/ktx',
	'application/dicom',
	'audio/x-musepack',
	'text/calendar',
	'text/vcard',
	'model/gltf-binary',
	'application/vnd.tcpdump.pcap',
	'audio/x-dsf', // Non-standard
	'application/x.ms.shortcut', // Invented by us
	'application/x.apple.alias', // Invented by us
	'audio/x-voc',
	'audio/vnd.dolby.dd-raw',
	'audio/x-m4a',
	'image/apng',
	'image/x-olympus-orf',
	'image/x-sony-arw',
	'image/x-adobe-dng',
	'image/x-nikon-nef',
	'image/x-panasonic-rw2',
	'image/x-fujifilm-raf',
	'video/x-m4v',
	'video/3gpp2',
	'application/x-esri-shape',
	'audio/aac',
	'audio/x-it',
	'audio/x-s3m',
	'audio/x-xm',
	'video/MP1S',
	'video/MP2P',
	'application/vnd.sketchup.skp',
	'image/avif',
	'application/x-lzh-compressed',
	'application/pgp-encrypted',
	'application/x-asar',
	'model/stl',
	'application/vnd.ms-htmlhelp',
	'model/3mf',
	'image/jxl',
	'application/zstd',
	'image/jls',
	'application/vnd.ms-outlook',
	'image/vnd.dwg',
	'application/x-parquet',
	'application/java-vm',
	'application/x-arj',
	'application/x-cpio',
	'application/x-ace-compressed',
	'application/avro',
	'application/vnd.iccprofile',
	'application/x.autodesk.fbx', // Invented by us
];

const minimumBytes = 4100; // A fair amount of file-types are detectable within this range.

async function fileTypeFromBuffer(input) {
	return new FileTypeParser().fromBuffer(input);
}

function _check(buffer, headers, options) {
	options = {
		offset: 0,
		...options,
	};

	for (const [index, header] of headers.entries()) {
		// If a bitmask is set
		if (options.mask) {
			// If header doesn't equal `buf` with bits masked off
			if (header !== (options.mask[index] & buffer[index + options.offset])) {
				return false;
			}
		} else if (header !== buffer[index + options.offset]) {
			return false;
		}
	}

	return true;
}

class FileTypeParser {
	constructor(options) {
		this.detectors = options?.customDetectors;

		this.fromTokenizer = this.fromTokenizer.bind(this);
		this.fromBuffer = this.fromBuffer.bind(this);
		this.parse = this.parse.bind(this);
	}

	async fromTokenizer(tokenizer) {
		const initialPosition = tokenizer.position;

		for (const detector of this.detectors || []) {
			const fileType = await detector(tokenizer);
			if (fileType) {
				return fileType;
			}

			if (initialPosition !== tokenizer.position) {
				return undefined; // Cannot proceed scanning of the tokenizer is at an arbitrary position
			}
		}

		return this.parse(tokenizer);
	}

	async fromBuffer(input) {
		if (!(input instanceof Uint8Array || input instanceof ArrayBuffer)) {
			throw new TypeError(`Expected the \`input\` argument to be of type \`Uint8Array\` or \`Buffer\` or \`ArrayBuffer\`, got \`${typeof input}\``);
		}

		const buffer = input instanceof Uint8Array ? input : new Uint8Array(input);

		if (!(buffer?.length > 1)) {
			return;
		}

		return this.fromTokenizer(fromBuffer(buffer));
	}

	async fromBlob(blob) {
		const buffer = await blob.arrayBuffer();
		return this.fromBuffer(new Uint8Array(buffer));
	}

	async fromStream(stream) {
		const tokenizer = await fromStream(stream);
		try {
			return await this.fromTokenizer(tokenizer);
		} finally {
			await tokenizer.close();
		}
	}

	async toDetectionStream(readableStream, options = {}) {
		const {default: stream} = await import('node:stream');
		const {sampleSize = minimumBytes} = options;

		return new Promise((resolve, reject) => {
			readableStream.on('error', reject);

			readableStream.once('readable', () => {
				(async () => {
					try {
						// Set up output stream
						const pass = new stream.PassThrough();
						const outputStream = stream.pipeline ? stream.pipeline(readableStream, pass, () => {}) : readableStream.pipe(pass);

						// Read the input stream and detect the filetype
						const chunk = readableStream.read(sampleSize) ?? readableStream.read() ?? node_buffer.Buffer.alloc(0);
						try {
							pass.fileType = await this.fromBuffer(chunk);
						} catch (error) {
							if (error instanceof EndOfStreamError) {
								pass.fileType = undefined;
							} else {
								reject(error);
							}
						}

						resolve(outputStream);
					} catch (error) {
						reject(error);
					}
				})();
			});
		});
	}

	check(header, options) {
		return _check(this.buffer, header, options);
	}

	checkString(header, options) {
		return this.check(stringToBytes(header), options);
	}

	async parse(tokenizer) {
		this.buffer = node_buffer.Buffer.alloc(minimumBytes);

		// Keep reading until EOF if the file size is unknown.
		if (tokenizer.fileInfo.size === undefined) {
			tokenizer.fileInfo.size = Number.MAX_SAFE_INTEGER;
		}

		this.tokenizer = tokenizer;

		await tokenizer.peekBuffer(this.buffer, {length: 12, mayBeLess: true});

		// -- 2-byte signatures --

		if (this.check([0x42, 0x4D])) {
			return {
				ext: 'bmp',
				mime: 'image/bmp',
			};
		}

		if (this.check([0x0B, 0x77])) {
			return {
				ext: 'ac3',
				mime: 'audio/vnd.dolby.dd-raw',
			};
		}

		if (this.check([0x78, 0x01])) {
			return {
				ext: 'dmg',
				mime: 'application/x-apple-diskimage',
			};
		}

		if (this.check([0x4D, 0x5A])) {
			return {
				ext: 'exe',
				mime: 'application/x-msdownload',
			};
		}

		if (this.check([0x25, 0x21])) {
			await tokenizer.peekBuffer(this.buffer, {length: 24, mayBeLess: true});

			if (
				this.checkString('PS-Adobe-', {offset: 2})
				&& this.checkString(' EPSF-', {offset: 14})
			) {
				return {
					ext: 'eps',
					mime: 'application/eps',
				};
			}

			return {
				ext: 'ps',
				mime: 'application/postscript',
			};
		}

		if (
			this.check([0x1F, 0xA0])
			|| this.check([0x1F, 0x9D])
		) {
			return {
				ext: 'Z',
				mime: 'application/x-compress',
			};
		}

		if (this.check([0xC7, 0x71])) {
			return {
				ext: 'cpio',
				mime: 'application/x-cpio',
			};
		}

		if (this.check([0x60, 0xEA])) {
			return {
				ext: 'arj',
				mime: 'application/x-arj',
			};
		}

		// -- 3-byte signatures --

		if (this.check([0xEF, 0xBB, 0xBF])) { // UTF-8-BOM
			// Strip off UTF-8-BOM
			this.tokenizer.ignore(3);
			return this.parse(tokenizer);
		}

		if (this.check([0x47, 0x49, 0x46])) {
			return {
				ext: 'gif',
				mime: 'image/gif',
			};
		}

		if (this.check([0x49, 0x49, 0xBC])) {
			return {
				ext: 'jxr',
				mime: 'image/vnd.ms-photo',
			};
		}

		if (this.check([0x1F, 0x8B, 0x8])) {
			return {
				ext: 'gz',
				mime: 'application/gzip',
			};
		}

		if (this.check([0x42, 0x5A, 0x68])) {
			return {
				ext: 'bz2',
				mime: 'application/x-bzip2',
			};
		}

		if (this.checkString('ID3')) {
			await tokenizer.ignore(6); // Skip ID3 header until the header size
			const id3HeaderLength = await tokenizer.readToken(uint32SyncSafeToken);
			if (tokenizer.position + id3HeaderLength > tokenizer.fileInfo.size) {
				// Guess file type based on ID3 header for backward compatibility
				return {
					ext: 'mp3',
					mime: 'audio/mpeg',
				};
			}

			await tokenizer.ignore(id3HeaderLength);
			return this.fromTokenizer(tokenizer); // Skip ID3 header, recursion
		}

		// Musepack, SV7
		if (this.checkString('MP+')) {
			return {
				ext: 'mpc',
				mime: 'audio/x-musepack',
			};
		}

		if (
			(this.buffer[0] === 0x43 || this.buffer[0] === 0x46)
			&& this.check([0x57, 0x53], {offset: 1})
		) {
			return {
				ext: 'swf',
				mime: 'application/x-shockwave-flash',
			};
		}

		// -- 4-byte signatures --

		// Requires a sample size of 4 bytes
		if (this.check([0xFF, 0xD8, 0xFF])) {
			if (this.check([0xF7], {offset: 3})) { // JPG7/SOF55, indicating a ISO/IEC 14495 / JPEG-LS file
				return {
					ext: 'jls',
					mime: 'image/jls',
				};
			}

			return {
				ext: 'jpg',
				mime: 'image/jpeg',
			};
		}

		if (this.check([0x4F, 0x62, 0x6A, 0x01])) {
			return {
				ext: 'avro',
				mime: 'application/avro',
			};
		}

		if (this.checkString('FLIF')) {
			return {
				ext: 'flif',
				mime: 'image/flif',
			};
		}

		if (this.checkString('8BPS')) {
			return {
				ext: 'psd',
				mime: 'image/vnd.adobe.photoshop',
			};
		}

		if (this.checkString('WEBP', {offset: 8})) {
			return {
				ext: 'webp',
				mime: 'image/webp',
			};
		}

		// Musepack, SV8
		if (this.checkString('MPCK')) {
			return {
				ext: 'mpc',
				mime: 'audio/x-musepack',
			};
		}

		if (this.checkString('FORM')) {
			return {
				ext: 'aif',
				mime: 'audio/aiff',
			};
		}

		if (this.checkString('icns', {offset: 0})) {
			return {
				ext: 'icns',
				mime: 'image/icns',
			};
		}

		// Zip-based file formats
		// Need to be before the `zip` check
		if (this.check([0x50, 0x4B, 0x3, 0x4])) { // Local file header signature
			try {
				while (tokenizer.position + 30 < tokenizer.fileInfo.size) {
					await tokenizer.readBuffer(this.buffer, {length: 30});

					// https://en.wikipedia.org/wiki/Zip_(file_format)#File_headers
					const zipHeader = {
						compressedSize: this.buffer.readUInt32LE(18),
						uncompressedSize: this.buffer.readUInt32LE(22),
						filenameLength: this.buffer.readUInt16LE(26),
						extraFieldLength: this.buffer.readUInt16LE(28),
					};

					zipHeader.filename = await tokenizer.readToken(new StringType(zipHeader.filenameLength, 'utf-8'));
					await tokenizer.ignore(zipHeader.extraFieldLength);

					// Assumes signed `.xpi` from addons.mozilla.org
					if (zipHeader.filename === 'META-INF/mozilla.rsa') {
						return {
							ext: 'xpi',
							mime: 'application/x-xpinstall',
						};
					}

					if (zipHeader.filename.endsWith('.rels') || zipHeader.filename.endsWith('.xml')) {
						const type = zipHeader.filename.split('/')[0];
						switch (type) {
							case '_rels':
								break;
							case 'word':
								return {
									ext: 'docx',
									mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
								};
							case 'ppt':
								return {
									ext: 'pptx',
									mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
								};
							case 'xl':
								return {
									ext: 'xlsx',
									mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
								};
							default:
								break;
						}
					}

					if (zipHeader.filename.startsWith('xl/')) {
						return {
							ext: 'xlsx',
							mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
						};
					}

					if (zipHeader.filename.startsWith('3D/') && zipHeader.filename.endsWith('.model')) {
						return {
							ext: '3mf',
							mime: 'model/3mf',
						};
					}

					// The docx, xlsx and pptx file types extend the Office Open XML file format:
					// https://en.wikipedia.org/wiki/Office_Open_XML_file_formats
					// We look for:
					// - one entry named '[Content_Types].xml' or '_rels/.rels',
					// - one entry indicating specific type of file.
					// MS Office, OpenOffice and LibreOffice may put the parts in different order, so the check should not rely on it.
					if (zipHeader.filename === 'mimetype' && zipHeader.compressedSize === zipHeader.uncompressedSize) {
						let mimeType = await tokenizer.readToken(new StringType(zipHeader.compressedSize, 'utf-8'));
						mimeType = mimeType.trim();

						switch (mimeType) {
							case 'application/epub+zip':
								return {
									ext: 'epub',
									mime: 'application/epub+zip',
								};
							case 'application/vnd.oasis.opendocument.text':
								return {
									ext: 'odt',
									mime: 'application/vnd.oasis.opendocument.text',
								};
							case 'application/vnd.oasis.opendocument.spreadsheet':
								return {
									ext: 'ods',
									mime: 'application/vnd.oasis.opendocument.spreadsheet',
								};
							case 'application/vnd.oasis.opendocument.presentation':
								return {
									ext: 'odp',
									mime: 'application/vnd.oasis.opendocument.presentation',
								};
							default:
						}
					}

					// Try to find next header manually when current one is corrupted
					if (zipHeader.compressedSize === 0) {
						let nextHeaderIndex = -1;

						while (nextHeaderIndex < 0 && (tokenizer.position < tokenizer.fileInfo.size)) {
							await tokenizer.peekBuffer(this.buffer, {mayBeLess: true});

							nextHeaderIndex = this.buffer.indexOf('504B0304', 0, 'hex');
							// Move position to the next header if found, skip the whole buffer otherwise
							await tokenizer.ignore(nextHeaderIndex >= 0 ? nextHeaderIndex : this.buffer.length);
						}
					} else {
						await tokenizer.ignore(zipHeader.compressedSize);
					}
				}
			} catch (error) {
				if (!(error instanceof EndOfStreamError)) {
					throw error;
				}
			}

			return {
				ext: 'zip',
				mime: 'application/zip',
			};
		}

		if (this.checkString('OggS')) {
			// This is an OGG container
			await tokenizer.ignore(28);
			const type = node_buffer.Buffer.alloc(8);
			await tokenizer.readBuffer(type);

			// Needs to be before `ogg` check
			if (_check(type, [0x4F, 0x70, 0x75, 0x73, 0x48, 0x65, 0x61, 0x64])) {
				return {
					ext: 'opus',
					mime: 'audio/opus',
				};
			}

			// If ' theora' in header.
			if (_check(type, [0x80, 0x74, 0x68, 0x65, 0x6F, 0x72, 0x61])) {
				return {
					ext: 'ogv',
					mime: 'video/ogg',
				};
			}

			// If '\x01video' in header.
			if (_check(type, [0x01, 0x76, 0x69, 0x64, 0x65, 0x6F, 0x00])) {
				return {
					ext: 'ogm',
					mime: 'video/ogg',
				};
			}

			// If ' FLAC' in header  https://xiph.org/flac/faq.html
			if (_check(type, [0x7F, 0x46, 0x4C, 0x41, 0x43])) {
				return {
					ext: 'oga',
					mime: 'audio/ogg',
				};
			}

			// 'Speex  ' in header https://en.wikipedia.org/wiki/Speex
			if (_check(type, [0x53, 0x70, 0x65, 0x65, 0x78, 0x20, 0x20])) {
				return {
					ext: 'spx',
					mime: 'audio/ogg',
				};
			}

			// If '\x01vorbis' in header
			if (_check(type, [0x01, 0x76, 0x6F, 0x72, 0x62, 0x69, 0x73])) {
				return {
					ext: 'ogg',
					mime: 'audio/ogg',
				};
			}

			// Default OGG container https://www.iana.org/assignments/media-types/application/ogg
			return {
				ext: 'ogx',
				mime: 'application/ogg',
			};
		}

		if (
			this.check([0x50, 0x4B])
			&& (this.buffer[2] === 0x3 || this.buffer[2] === 0x5 || this.buffer[2] === 0x7)
			&& (this.buffer[3] === 0x4 || this.buffer[3] === 0x6 || this.buffer[3] === 0x8)
		) {
			return {
				ext: 'zip',
				mime: 'application/zip',
			};
		}

		//

		// File Type Box (https://en.wikipedia.org/wiki/ISO_base_media_file_format)
		// It's not required to be first, but it's recommended to be. Almost all ISO base media files start with `ftyp` box.
		// `ftyp` box must contain a brand major identifier, which must consist of ISO 8859-1 printable characters.
		// Here we check for 8859-1 printable characters (for simplicity, it's a mask which also catches one non-printable character).
		if (
			this.checkString('ftyp', {offset: 4})
			&& (this.buffer[8] & 0x60) !== 0x00 // Brand major, first character ASCII?
		) {
			// They all can have MIME `video/mp4` except `application/mp4` special-case which is hard to detect.
			// For some cases, we're specific, everything else falls to `video/mp4` with `mp4` extension.
			const brandMajor = this.buffer.toString('binary', 8, 12).replace('\0', ' ').trim();
			switch (brandMajor) {
				case 'avif':
				case 'avis':
					return {ext: 'avif', mime: 'image/avif'};
				case 'mif1':
					return {ext: 'heic', mime: 'image/heif'};
				case 'msf1':
					return {ext: 'heic', mime: 'image/heif-sequence'};
				case 'heic':
				case 'heix':
					return {ext: 'heic', mime: 'image/heic'};
				case 'hevc':
				case 'hevx':
					return {ext: 'heic', mime: 'image/heic-sequence'};
				case 'qt':
					return {ext: 'mov', mime: 'video/quicktime'};
				case 'M4V':
				case 'M4VH':
				case 'M4VP':
					return {ext: 'm4v', mime: 'video/x-m4v'};
				case 'M4P':
					return {ext: 'm4p', mime: 'video/mp4'};
				case 'M4B':
					return {ext: 'm4b', mime: 'audio/mp4'};
				case 'M4A':
					return {ext: 'm4a', mime: 'audio/x-m4a'};
				case 'F4V':
					return {ext: 'f4v', mime: 'video/mp4'};
				case 'F4P':
					return {ext: 'f4p', mime: 'video/mp4'};
				case 'F4A':
					return {ext: 'f4a', mime: 'audio/mp4'};
				case 'F4B':
					return {ext: 'f4b', mime: 'audio/mp4'};
				case 'crx':
					return {ext: 'cr3', mime: 'image/x-canon-cr3'};
				default:
					if (brandMajor.startsWith('3g')) {
						if (brandMajor.startsWith('3g2')) {
							return {ext: '3g2', mime: 'video/3gpp2'};
						}

						return {ext: '3gp', mime: 'video/3gpp'};
					}

					return {ext: 'mp4', mime: 'video/mp4'};
			}
		}

		if (this.checkString('MThd')) {
			return {
				ext: 'mid',
				mime: 'audio/midi',
			};
		}

		if (
			this.checkString('wOFF')
			&& (
				this.check([0x00, 0x01, 0x00, 0x00], {offset: 4})
				|| this.checkString('OTTO', {offset: 4})
			)
		) {
			return {
				ext: 'woff',
				mime: 'font/woff',
			};
		}

		if (
			this.checkString('wOF2')
			&& (
				this.check([0x00, 0x01, 0x00, 0x00], {offset: 4})
				|| this.checkString('OTTO', {offset: 4})
			)
		) {
			return {
				ext: 'woff2',
				mime: 'font/woff2',
			};
		}

		if (this.check([0xD4, 0xC3, 0xB2, 0xA1]) || this.check([0xA1, 0xB2, 0xC3, 0xD4])) {
			return {
				ext: 'pcap',
				mime: 'application/vnd.tcpdump.pcap',
			};
		}

		// Sony DSD Stream File (DSF)
		if (this.checkString('DSD ')) {
			return {
				ext: 'dsf',
				mime: 'audio/x-dsf', // Non-standard
			};
		}

		if (this.checkString('LZIP')) {
			return {
				ext: 'lz',
				mime: 'application/x-lzip',
			};
		}

		if (this.checkString('fLaC')) {
			return {
				ext: 'flac',
				mime: 'audio/x-flac',
			};
		}

		if (this.check([0x42, 0x50, 0x47, 0xFB])) {
			return {
				ext: 'bpg',
				mime: 'image/bpg',
			};
		}

		if (this.checkString('wvpk')) {
			return {
				ext: 'wv',
				mime: 'audio/wavpack',
			};
		}

		if (this.checkString('%PDF')) {
			try {
				await tokenizer.ignore(1350);
				const maxBufferSize = 10 * 1024 * 1024;
				const buffer = node_buffer.Buffer.alloc(Math.min(maxBufferSize, tokenizer.fileInfo.size));
				await tokenizer.readBuffer(buffer, {mayBeLess: true});

				// Check if this is an Adobe Illustrator file
				if (buffer.includes(node_buffer.Buffer.from('AIPrivateData'))) {
					return {
						ext: 'ai',
						mime: 'application/postscript',
					};
				}
			} catch (error) {
				// Swallow end of stream error if file is too small for the Adobe AI check
				if (!(error instanceof EndOfStreamError)) {
					throw error;
				}
			}

			// Assume this is just a normal PDF
			return {
				ext: 'pdf',
				mime: 'application/pdf',
			};
		}

		if (this.check([0x00, 0x61, 0x73, 0x6D])) {
			return {
				ext: 'wasm',
				mime: 'application/wasm',
			};
		}

		// TIFF, little-endian type
		if (this.check([0x49, 0x49])) {
			const fileType = await this.readTiffHeader(false);
			if (fileType) {
				return fileType;
			}
		}

		// TIFF, big-endian type
		if (this.check([0x4D, 0x4D])) {
			const fileType = await this.readTiffHeader(true);
			if (fileType) {
				return fileType;
			}
		}

		if (this.checkString('MAC ')) {
			return {
				ext: 'ape',
				mime: 'audio/ape',
			};
		}

		// https://github.com/file/file/blob/master/magic/Magdir/matroska
		if (this.check([0x1A, 0x45, 0xDF, 0xA3])) { // Root element: EBML
			async function readField() {
				const msb = await tokenizer.peekNumber(UINT8);
				let mask = 0x80;
				let ic = 0; // 0 = A, 1 = B, 2 = C, 3
				// = D

				while ((msb & mask) === 0 && mask !== 0) {
					++ic;
					mask >>= 1;
				}

				const id = node_buffer.Buffer.alloc(ic + 1);
				await tokenizer.readBuffer(id);
				return id;
			}

			async function readElement() {
				const id = await readField();
				const lengthField = await readField();
				lengthField[0] ^= 0x80 >> (lengthField.length - 1);
				const nrLength = Math.min(6, lengthField.length); // JavaScript can max read 6 bytes integer
				return {
					id: id.readUIntBE(0, id.length),
					len: lengthField.readUIntBE(lengthField.length - nrLength, nrLength),
				};
			}

			async function readChildren(children) {
				while (children > 0) {
					const element = await readElement();
					if (element.id === 0x42_82) {
						const rawValue = await tokenizer.readToken(new StringType(element.len, 'utf-8'));
						return rawValue.replace(/\00.*$/g, ''); // Return DocType
					}

					await tokenizer.ignore(element.len); // ignore payload
					--children;
				}
			}

			const re = await readElement();
			const docType = await readChildren(re.len);

			switch (docType) {
				case 'webm':
					return {
						ext: 'webm',
						mime: 'video/webm',
					};

				case 'matroska':
					return {
						ext: 'mkv',
						mime: 'video/x-matroska',
					};

				default:
					return;
			}
		}

		// RIFF file format which might be AVI, WAV, QCP, etc
		if (this.check([0x52, 0x49, 0x46, 0x46])) {
			if (this.check([0x41, 0x56, 0x49], {offset: 8})) {
				return {
					ext: 'avi',
					mime: 'video/vnd.avi',
				};
			}

			if (this.check([0x57, 0x41, 0x56, 0x45], {offset: 8})) {
				return {
					ext: 'wav',
					mime: 'audio/vnd.wave',
				};
			}

			// QLCM, QCP file
			if (this.check([0x51, 0x4C, 0x43, 0x4D], {offset: 8})) {
				return {
					ext: 'qcp',
					mime: 'audio/qcelp',
				};
			}
		}

		if (this.checkString('SQLi')) {
			return {
				ext: 'sqlite',
				mime: 'application/x-sqlite3',
			};
		}

		if (this.check([0x4E, 0x45, 0x53, 0x1A])) {
			return {
				ext: 'nes',
				mime: 'application/x-nintendo-nes-rom',
			};
		}

		if (this.checkString('Cr24')) {
			return {
				ext: 'crx',
				mime: 'application/x-google-chrome-extension',
			};
		}

		if (
			this.checkString('MSCF')
			|| this.checkString('ISc(')
		) {
			return {
				ext: 'cab',
				mime: 'application/vnd.ms-cab-compressed',
			};
		}

		if (this.check([0xED, 0xAB, 0xEE, 0xDB])) {
			return {
				ext: 'rpm',
				mime: 'application/x-rpm',
			};
		}

		if (this.check([0xC5, 0xD0, 0xD3, 0xC6])) {
			return {
				ext: 'eps',
				mime: 'application/eps',
			};
		}

		if (this.check([0x28, 0xB5, 0x2F, 0xFD])) {
			return {
				ext: 'zst',
				mime: 'application/zstd',
			};
		}

		if (this.check([0x7F, 0x45, 0x4C, 0x46])) {
			return {
				ext: 'elf',
				mime: 'application/x-elf',
			};
		}

		if (this.check([0x21, 0x42, 0x44, 0x4E])) {
			return {
				ext: 'pst',
				mime: 'application/vnd.ms-outlook',
			};
		}

		if (this.checkString('PAR1')) {
			return {
				ext: 'parquet',
				mime: 'application/x-parquet',
			};
		}

		if (this.check([0xCF, 0xFA, 0xED, 0xFE])) {
			return {
				ext: 'macho',
				mime: 'application/x-mach-binary',
			};
		}

		// -- 5-byte signatures --

		if (this.check([0x4F, 0x54, 0x54, 0x4F, 0x00])) {
			return {
				ext: 'otf',
				mime: 'font/otf',
			};
		}

		if (this.checkString('#!AMR')) {
			return {
				ext: 'amr',
				mime: 'audio/amr',
			};
		}

		if (this.checkString('{\\rtf')) {
			return {
				ext: 'rtf',
				mime: 'application/rtf',
			};
		}

		if (this.check([0x46, 0x4C, 0x56, 0x01])) {
			return {
				ext: 'flv',
				mime: 'video/x-flv',
			};
		}

		if (this.checkString('IMPM')) {
			return {
				ext: 'it',
				mime: 'audio/x-it',
			};
		}

		if (
			this.checkString('-lh0-', {offset: 2})
			|| this.checkString('-lh1-', {offset: 2})
			|| this.checkString('-lh2-', {offset: 2})
			|| this.checkString('-lh3-', {offset: 2})
			|| this.checkString('-lh4-', {offset: 2})
			|| this.checkString('-lh5-', {offset: 2})
			|| this.checkString('-lh6-', {offset: 2})
			|| this.checkString('-lh7-', {offset: 2})
			|| this.checkString('-lzs-', {offset: 2})
			|| this.checkString('-lz4-', {offset: 2})
			|| this.checkString('-lz5-', {offset: 2})
			|| this.checkString('-lhd-', {offset: 2})
		) {
			return {
				ext: 'lzh',
				mime: 'application/x-lzh-compressed',
			};
		}

		// MPEG program stream (PS or MPEG-PS)
		if (this.check([0x00, 0x00, 0x01, 0xBA])) {
			//  MPEG-PS, MPEG-1 Part 1
			if (this.check([0x21], {offset: 4, mask: [0xF1]})) {
				return {
					ext: 'mpg', // May also be .ps, .mpeg
					mime: 'video/MP1S',
				};
			}

			// MPEG-PS, MPEG-2 Part 1
			if (this.check([0x44], {offset: 4, mask: [0xC4]})) {
				return {
					ext: 'mpg', // May also be .mpg, .m2p, .vob or .sub
					mime: 'video/MP2P',
				};
			}
		}

		if (this.checkString('ITSF')) {
			return {
				ext: 'chm',
				mime: 'application/vnd.ms-htmlhelp',
			};
		}

		if (this.check([0xCA, 0xFE, 0xBA, 0xBE])) {
			return {
				ext: 'class',
				mime: 'application/java-vm',
			};
		}

		// -- 6-byte signatures --

		if (this.check([0xFD, 0x37, 0x7A, 0x58, 0x5A, 0x00])) {
			return {
				ext: 'xz',
				mime: 'application/x-xz',
			};
		}

		if (this.checkString('<?xml ')) {
			return {
				ext: 'xml',
				mime: 'application/xml',
			};
		}

		if (this.check([0x37, 0x7A, 0xBC, 0xAF, 0x27, 0x1C])) {
			return {
				ext: '7z',
				mime: 'application/x-7z-compressed',
			};
		}

		if (
			this.check([0x52, 0x61, 0x72, 0x21, 0x1A, 0x7])
			&& (this.buffer[6] === 0x0 || this.buffer[6] === 0x1)
		) {
			return {
				ext: 'rar',
				mime: 'application/x-rar-compressed',
			};
		}

		if (this.checkString('solid ')) {
			return {
				ext: 'stl',
				mime: 'model/stl',
			};
		}

		if (this.checkString('AC')) {
			const version = this.buffer.toString('binary', 2, 6);
			if (version.match('^d*') && version >= 1000 && version <= 1050) {
				return {
					ext: 'dwg',
					mime: 'image/vnd.dwg',
				};
			}
		}

		if (this.checkString('070707')) {
			return {
				ext: 'cpio',
				mime: 'application/x-cpio',
			};
		}

		// -- 7-byte signatures --

		if (this.checkString('BLENDER')) {
			return {
				ext: 'blend',
				mime: 'application/x-blender',
			};
		}

		if (this.checkString('!<arch>')) {
			await tokenizer.ignore(8);
			const string = await tokenizer.readToken(new StringType(13, 'ascii'));
			if (string === 'debian-binary') {
				return {
					ext: 'deb',
					mime: 'application/x-deb',
				};
			}

			return {
				ext: 'ar',
				mime: 'application/x-unix-archive',
			};
		}

		if (this.checkString('**ACE', {offset: 7})) {
			await tokenizer.peekBuffer(this.buffer, {length: 14, mayBeLess: true});
			if (this.checkString('**', {offset: 12})) {
				return {
					ext: 'ace',
					mime: 'application/x-ace-compressed',
				};
			}
		}

		// -- 8-byte signatures --

		if (this.check([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A])) {
			// APNG format (https://wiki.mozilla.org/APNG_Specification)
			// 1. Find the first IDAT (image data) chunk (49 44 41 54)
			// 2. Check if there is an "acTL" chunk before the IDAT one (61 63 54 4C)

			// Offset calculated as follows:
			// - 8 bytes: PNG signature
			// - 4 (length) + 4 (chunk type) + 13 (chunk data) + 4 (CRC): IHDR chunk

			await tokenizer.ignore(8); // ignore PNG signature

			async function readChunkHeader() {
				return {
					length: await tokenizer.readToken(INT32_BE),
					type: await tokenizer.readToken(new StringType(4, 'binary')),
				};
			}

			do {
				const chunk = await readChunkHeader();
				if (chunk.length < 0) {
					return; // Invalid chunk length
				}

				switch (chunk.type) {
					case 'IDAT':
						return {
							ext: 'png',
							mime: 'image/png',
						};
					case 'acTL':
						return {
							ext: 'apng',
							mime: 'image/apng',
						};
					default:
						await tokenizer.ignore(chunk.length + 4); // Ignore chunk-data + CRC
				}
			} while (tokenizer.position + 8 < tokenizer.fileInfo.size);

			return {
				ext: 'png',
				mime: 'image/png',
			};
		}

		if (this.check([0x41, 0x52, 0x52, 0x4F, 0x57, 0x31, 0x00, 0x00])) {
			return {
				ext: 'arrow',
				mime: 'application/x-apache-arrow',
			};
		}

		if (this.check([0x67, 0x6C, 0x54, 0x46, 0x02, 0x00, 0x00, 0x00])) {
			return {
				ext: 'glb',
				mime: 'model/gltf-binary',
			};
		}

		// `mov` format variants
		if (
			this.check([0x66, 0x72, 0x65, 0x65], {offset: 4}) // `free`
			|| this.check([0x6D, 0x64, 0x61, 0x74], {offset: 4}) // `mdat` MJPEG
			|| this.check([0x6D, 0x6F, 0x6F, 0x76], {offset: 4}) // `moov`
			|| this.check([0x77, 0x69, 0x64, 0x65], {offset: 4}) // `wide`
		) {
			return {
				ext: 'mov',
				mime: 'video/quicktime',
			};
		}

		// -- 9-byte signatures --

		if (this.check([0x49, 0x49, 0x52, 0x4F, 0x08, 0x00, 0x00, 0x00, 0x18])) {
			return {
				ext: 'orf',
				mime: 'image/x-olympus-orf',
			};
		}

		if (this.checkString('gimp xcf ')) {
			return {
				ext: 'xcf',
				mime: 'image/x-xcf',
			};
		}

		// -- 12-byte signatures --

		if (this.check([0x49, 0x49, 0x55, 0x00, 0x18, 0x00, 0x00, 0x00, 0x88, 0xE7, 0x74, 0xD8])) {
			return {
				ext: 'rw2',
				mime: 'image/x-panasonic-rw2',
			};
		}

		// ASF_Header_Object first 80 bytes
		if (this.check([0x30, 0x26, 0xB2, 0x75, 0x8E, 0x66, 0xCF, 0x11, 0xA6, 0xD9])) {
			async function readHeader() {
				const guid = node_buffer.Buffer.alloc(16);
				await tokenizer.readBuffer(guid);
				return {
					id: guid,
					size: Number(await tokenizer.readToken(UINT64_LE)),
				};
			}

			await tokenizer.ignore(30);
			// Search for header should be in first 1KB of file.
			while (tokenizer.position + 24 < tokenizer.fileInfo.size) {
				const header = await readHeader();
				let payload = header.size - 24;
				if (_check(header.id, [0x91, 0x07, 0xDC, 0xB7, 0xB7, 0xA9, 0xCF, 0x11, 0x8E, 0xE6, 0x00, 0xC0, 0x0C, 0x20, 0x53, 0x65])) {
					// Sync on Stream-Properties-Object (B7DC0791-A9B7-11CF-8EE6-00C00C205365)
					const typeId = node_buffer.Buffer.alloc(16);
					payload -= await tokenizer.readBuffer(typeId);

					if (_check(typeId, [0x40, 0x9E, 0x69, 0xF8, 0x4D, 0x5B, 0xCF, 0x11, 0xA8, 0xFD, 0x00, 0x80, 0x5F, 0x5C, 0x44, 0x2B])) {
						// Found audio:
						return {
							ext: 'asf',
							mime: 'audio/x-ms-asf',
						};
					}

					if (_check(typeId, [0xC0, 0xEF, 0x19, 0xBC, 0x4D, 0x5B, 0xCF, 0x11, 0xA8, 0xFD, 0x00, 0x80, 0x5F, 0x5C, 0x44, 0x2B])) {
						// Found video:
						return {
							ext: 'asf',
							mime: 'video/x-ms-asf',
						};
					}

					break;
				}

				await tokenizer.ignore(payload);
			}

			// Default to ASF generic extension
			return {
				ext: 'asf',
				mime: 'application/vnd.ms-asf',
			};
		}

		if (this.check([0xAB, 0x4B, 0x54, 0x58, 0x20, 0x31, 0x31, 0xBB, 0x0D, 0x0A, 0x1A, 0x0A])) {
			return {
				ext: 'ktx',
				mime: 'image/ktx',
			};
		}

		if ((this.check([0x7E, 0x10, 0x04]) || this.check([0x7E, 0x18, 0x04])) && this.check([0x30, 0x4D, 0x49, 0x45], {offset: 4})) {
			return {
				ext: 'mie',
				mime: 'application/x-mie',
			};
		}

		if (this.check([0x27, 0x0A, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00], {offset: 2})) {
			return {
				ext: 'shp',
				mime: 'application/x-esri-shape',
			};
		}

		if (this.check([0xFF, 0x4F, 0xFF, 0x51])) {
			return {
				ext: 'j2c',
				mime: 'image/j2c',
			};
		}

		if (this.check([0x00, 0x00, 0x00, 0x0C, 0x6A, 0x50, 0x20, 0x20, 0x0D, 0x0A, 0x87, 0x0A])) {
			// JPEG-2000 family

			await tokenizer.ignore(20);
			const type = await tokenizer.readToken(new StringType(4, 'ascii'));
			switch (type) {
				case 'jp2 ':
					return {
						ext: 'jp2',
						mime: 'image/jp2',
					};
				case 'jpx ':
					return {
						ext: 'jpx',
						mime: 'image/jpx',
					};
				case 'jpm ':
					return {
						ext: 'jpm',
						mime: 'image/jpm',
					};
				case 'mjp2':
					return {
						ext: 'mj2',
						mime: 'image/mj2',
					};
				default:
					return;
			}
		}

		if (
			this.check([0xFF, 0x0A])
			|| this.check([0x00, 0x00, 0x00, 0x0C, 0x4A, 0x58, 0x4C, 0x20, 0x0D, 0x0A, 0x87, 0x0A])
		) {
			return {
				ext: 'jxl',
				mime: 'image/jxl',
			};
		}

		if (this.check([0xFE, 0xFF])) { // UTF-16-BOM-LE
			if (this.check([0, 60, 0, 63, 0, 120, 0, 109, 0, 108], {offset: 2})) {
				return {
					ext: 'xml',
					mime: 'application/xml',
				};
			}

			return undefined; // Some unknown text based format
		}

		// -- Unsafe signatures --

		if (
			this.check([0x0, 0x0, 0x1, 0xBA])
			|| this.check([0x0, 0x0, 0x1, 0xB3])
		) {
			return {
				ext: 'mpg',
				mime: 'video/mpeg',
			};
		}

		if (this.check([0x00, 0x01, 0x00, 0x00, 0x00])) {
			return {
				ext: 'ttf',
				mime: 'font/ttf',
			};
		}

		if (this.check([0x00, 0x00, 0x01, 0x00])) {
			return {
				ext: 'ico',
				mime: 'image/x-icon',
			};
		}

		if (this.check([0x00, 0x00, 0x02, 0x00])) {
			return {
				ext: 'cur',
				mime: 'image/x-icon',
			};
		}

		if (this.check([0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1])) {
			// Detected Microsoft Compound File Binary File (MS-CFB) Format.
			return {
				ext: 'cfb',
				mime: 'application/x-cfb',
			};
		}

		// Increase sample size from 12 to 256.
		await tokenizer.peekBuffer(this.buffer, {length: Math.min(256, tokenizer.fileInfo.size), mayBeLess: true});

		if (this.check([0x61, 0x63, 0x73, 0x70], {offset: 36})) {
			return {
				ext: 'icc',
				mime: 'application/vnd.iccprofile',
			};
		}

		// -- 15-byte signatures --

		if (this.checkString('BEGIN:')) {
			if (this.checkString('VCARD', {offset: 6})) {
				return {
					ext: 'vcf',
					mime: 'text/vcard',
				};
			}

			if (this.checkString('VCALENDAR', {offset: 6})) {
				return {
					ext: 'ics',
					mime: 'text/calendar',
				};
			}
		}

		// `raf` is here just to keep all the raw image detectors together.
		if (this.checkString('FUJIFILMCCD-RAW')) {
			return {
				ext: 'raf',
				mime: 'image/x-fujifilm-raf',
			};
		}

		if (this.checkString('Extended Module:')) {
			return {
				ext: 'xm',
				mime: 'audio/x-xm',
			};
		}

		if (this.checkString('Creative Voice File')) {
			return {
				ext: 'voc',
				mime: 'audio/x-voc',
			};
		}

		if (this.check([0x04, 0x00, 0x00, 0x00]) && this.buffer.length >= 16) { // Rough & quick check Pickle/ASAR
			const jsonSize = this.buffer.readUInt32LE(12);
			if (jsonSize > 12 && this.buffer.length >= jsonSize + 16) {
				try {
					const header = this.buffer.slice(16, jsonSize + 16).toString();
					const json = JSON.parse(header);
					// Check if Pickle is ASAR
					if (json.files) { // Final check, assuring Pickle/ASAR format
						return {
							ext: 'asar',
							mime: 'application/x-asar',
						};
					}
				} catch {}
			}
		}

		if (this.check([0x06, 0x0E, 0x2B, 0x34, 0x02, 0x05, 0x01, 0x01, 0x0D, 0x01, 0x02, 0x01, 0x01, 0x02])) {
			return {
				ext: 'mxf',
				mime: 'application/mxf',
			};
		}

		if (this.checkString('SCRM', {offset: 44})) {
			return {
				ext: 's3m',
				mime: 'audio/x-s3m',
			};
		}

		// Raw MPEG-2 transport stream (188-byte packets)
		if (this.check([0x47]) && this.check([0x47], {offset: 188})) {
			return {
				ext: 'mts',
				mime: 'video/mp2t',
			};
		}

		// Blu-ray Disc Audio-Video (BDAV) MPEG-2 transport stream has 4-byte TP_extra_header before each 188-byte packet
		if (this.check([0x47], {offset: 4}) && this.check([0x47], {offset: 196})) {
			return {
				ext: 'mts',
				mime: 'video/mp2t',
			};
		}

		if (this.check([0x42, 0x4F, 0x4F, 0x4B, 0x4D, 0x4F, 0x42, 0x49], {offset: 60})) {
			return {
				ext: 'mobi',
				mime: 'application/x-mobipocket-ebook',
			};
		}

		if (this.check([0x44, 0x49, 0x43, 0x4D], {offset: 128})) {
			return {
				ext: 'dcm',
				mime: 'application/dicom',
			};
		}

		if (this.check([0x4C, 0x00, 0x00, 0x00, 0x01, 0x14, 0x02, 0x00, 0x00, 0x00, 0x00, 0x00, 0xC0, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x46])) {
			return {
				ext: 'lnk',
				mime: 'application/x.ms.shortcut', // Invented by us
			};
		}

		if (this.check([0x62, 0x6F, 0x6F, 0x6B, 0x00, 0x00, 0x00, 0x00, 0x6D, 0x61, 0x72, 0x6B, 0x00, 0x00, 0x00, 0x00])) {
			return {
				ext: 'alias',
				mime: 'application/x.apple.alias', // Invented by us
			};
		}

		if (this.checkString('Kaydara FBX Binary  \u0000')) {
			return {
				ext: 'fbx',
				mime: 'application/x.autodesk.fbx', // Invented by us
			};
		}

		if (
			this.check([0x4C, 0x50], {offset: 34})
			&& (
				this.check([0x00, 0x00, 0x01], {offset: 8})
				|| this.check([0x01, 0x00, 0x02], {offset: 8})
				|| this.check([0x02, 0x00, 0x02], {offset: 8})
			)
		) {
			return {
				ext: 'eot',
				mime: 'application/vnd.ms-fontobject',
			};
		}

		if (this.check([0x06, 0x06, 0xED, 0xF5, 0xD8, 0x1D, 0x46, 0xE5, 0xBD, 0x31, 0xEF, 0xE7, 0xFE, 0x74, 0xB7, 0x1D])) {
			return {
				ext: 'indd',
				mime: 'application/x-indesign',
			};
		}

		// Increase sample size from 256 to 512
		await tokenizer.peekBuffer(this.buffer, {length: Math.min(512, tokenizer.fileInfo.size), mayBeLess: true});

		// Requires a buffer size of 512 bytes
		if (tarHeaderChecksumMatches(this.buffer)) {
			return {
				ext: 'tar',
				mime: 'application/x-tar',
			};
		}

		if (this.check([0xFF, 0xFE])) { // UTF-16-BOM-BE
			if (this.check([60, 0, 63, 0, 120, 0, 109, 0, 108, 0], {offset: 2})) {
				return {
					ext: 'xml',
					mime: 'application/xml',
				};
			}

			if (this.check([0xFF, 0x0E, 0x53, 0x00, 0x6B, 0x00, 0x65, 0x00, 0x74, 0x00, 0x63, 0x00, 0x68, 0x00, 0x55, 0x00, 0x70, 0x00, 0x20, 0x00, 0x4D, 0x00, 0x6F, 0x00, 0x64, 0x00, 0x65, 0x00, 0x6C, 0x00], {offset: 2})) {
				return {
					ext: 'skp',
					mime: 'application/vnd.sketchup.skp',
				};
			}

			return undefined; // Some text based format
		}

		if (this.checkString('-----BEGIN PGP MESSAGE-----')) {
			return {
				ext: 'pgp',
				mime: 'application/pgp-encrypted',
			};
		}

		// Check MPEG 1 or 2 Layer 3 header, or 'layer 0' for ADTS (MPEG sync-word 0xFFE)
		if (this.buffer.length >= 2 && this.check([0xFF, 0xE0], {offset: 0, mask: [0xFF, 0xE0]})) {
			if (this.check([0x10], {offset: 1, mask: [0x16]})) {
				// Check for (ADTS) MPEG-2
				if (this.check([0x08], {offset: 1, mask: [0x08]})) {
					return {
						ext: 'aac',
						mime: 'audio/aac',
					};
				}

				// Must be (ADTS) MPEG-4
				return {
					ext: 'aac',
					mime: 'audio/aac',
				};
			}

			// MPEG 1 or 2 Layer 3 header
			// Check for MPEG layer 3
			if (this.check([0x02], {offset: 1, mask: [0x06]})) {
				return {
					ext: 'mp3',
					mime: 'audio/mpeg',
				};
			}

			// Check for MPEG layer 2
			if (this.check([0x04], {offset: 1, mask: [0x06]})) {
				return {
					ext: 'mp2',
					mime: 'audio/mpeg',
				};
			}

			// Check for MPEG layer 1
			if (this.check([0x06], {offset: 1, mask: [0x06]})) {
				return {
					ext: 'mp1',
					mime: 'audio/mpeg',
				};
			}
		}
	}

	async readTiffTag(bigEndian) {
		const tagId = await this.tokenizer.readToken(bigEndian ? UINT16_BE : UINT16_LE);
		this.tokenizer.ignore(10);
		switch (tagId) {
			case 50_341:
				return {
					ext: 'arw',
					mime: 'image/x-sony-arw',
				};
			case 50_706:
				return {
					ext: 'dng',
					mime: 'image/x-adobe-dng',
				};
		}
	}

	async readTiffIFD(bigEndian) {
		const numberOfTags = await this.tokenizer.readToken(bigEndian ? UINT16_BE : UINT16_LE);
		for (let n = 0; n < numberOfTags; ++n) {
			const fileType = await this.readTiffTag(bigEndian);
			if (fileType) {
				return fileType;
			}
		}
	}

	async readTiffHeader(bigEndian) {
		const version = (bigEndian ? UINT16_BE : UINT16_LE).get(this.buffer, 2);
		const ifdOffset = (bigEndian ? UINT32_BE : UINT32_LE).get(this.buffer, 4);

		if (version === 42) {
			// TIFF file header
			if (ifdOffset >= 6) {
				if (this.checkString('CR', {offset: 8})) {
					return {
						ext: 'cr2',
						mime: 'image/x-canon-cr2',
					};
				}

				if (ifdOffset >= 8 && (this.check([0x1C, 0x00, 0xFE, 0x00], {offset: 8}) || this.check([0x1F, 0x00, 0x0B, 0x00], {offset: 8}))) {
					return {
						ext: 'nef',
						mime: 'image/x-nikon-nef',
					};
				}
			}

			await this.tokenizer.ignore(ifdOffset);
			const fileType = await this.readTiffIFD(bigEndian);
			return fileType ?? {
				ext: 'tif',
				mime: 'image/tiff',
			};
		}

		if (version === 43) {	// Big TIFF file header
			return {
				ext: 'tif',
				mime: 'image/tiff',
			};
		}
	}
}

new Set(extensions);
new Set(mimeTypes);

const imageExtensions = new Set([
	'jpg',
	'png',
	'gif',
	'webp',
	'flif',
	'cr2',
	'tif',
	'bmp',
	'jxr',
	'psd',
	'ico',
	'bpg',
	'jp2',
	'jpm',
	'jpx',
	'heic',
	'cur',
	'dcm',
	'avif',
]);

async function imageType(input) {
	const result = await fileTypeFromBuffer(input);
	return imageExtensions.has(result?.ext) && result;
}

// العربية
var ar = {};

// čeština
var cz = {};

// Dansk
var da = {};

// Deutsch
var de = {};

// English
var en = {
    // setting.ts
    "Plugin Settings": "Plugin Settings",
    "Auto pasted upload": "Auto pasted upload",
    "If you set this value true, when you paste image, it will be auto uploaded(you should set the picGo server rightly)": "If you set this value true, when you paste image, it will be auto uploaded(you should set the picGo server rightly)",
    "Default uploader": "Default uploader",
    "PicGo server": "PicGo server upload route",
    "PicGo server desc": "upload route, use PicList will be able to set picbed and config through query",
    "Please input PicGo server": "Please input upload route",
    "PicGo delete server": "PicGo server delete route(you need to use PicList app)",
    "PicList desc": "Search PicList on Github to download and install",
    "Please input PicGo delete server": "Please input delete server",
    "Delete image using PicList": "Delete image using PicList",
    "PicGo-Core path": "PicGo-Core path",
    "Delete successfully": "Delete successfully",
    "Delete failed": "Delete failed",
    "Image size suffix": "Image size suffix",
    "Image size suffix Description": "like |300 for resize image in ob.",
    "Please input image size suffix": "Please input image size suffix",
    "Error, could not delete": "Error, could not delete",
    "Please input PicGo-Core path, default using environment variables": "Please input PicGo-Core path, default using environment variables",
    "Work on network": "Work on network",
    "Work on network Description": "Allow upload network image by 'Upload all' command.\n Or when you paste, md standard image link in your clipboard will be auto upload.",
    "Upload when clipboard has image and text together": "Upload when clipboard has image and text together",
    "When you copy, some application like Excel will image and text to clipboard, you can upload or not.": "When you copy, some application like Excel will image and text to clipboard, you can upload or not.",
    "Network Domain Black List": "Network Domain Black List",
    "Network Domain Black List Description": "Image in the domain list will not be upload,use comma separated",
    "Delete source file after you upload file": "Delete source file after you upload file",
    "Delete source file in ob assets after you upload file.": "Delete source file in ob assets after you upload file.",
    "Image desc": "Image desc",
    reserve: "default",
    "remove all": "none",
    "remove default": "remove image.png",
    "Remote server mode": "Remote server mode",
    "Remote server mode desc": "If you have deployed piclist-core or piclist on the server.",
    "Can not find image file": "Can not find image file",
    "File has been changedd, upload failure": "File has been changedd, upload failure",
    "File has been changedd, download failure": "File has been changedd, download failure",
    "Warning: upload files is different of reciver files from api": "Warning: upload files num is different of reciver files from api",
    upload: "Upload",
};

// British English
var enGB = {};

// Español
var es = {};

// français
var fr = {};

// हिन्दी
var hi = {};

// Bahasa Indonesia
var id = {};

// Italiano
var it = {};

// 日本語
var ja = {};

// 한국어
var ko = {};

// Nederlands
var nl = {};

// Norsk
var no = {};

// język polski
var pl = {};

// Português
var pt = {};

// Português do Brasil
// Brazilian Portuguese
var ptBR = {};

// Română
var ro = {};

// русский
var ru = {};

// Türkçe
var tr = {};

// 简体中文
var zhCN = {
    // setting.ts
    "Plugin Settings": "插件设置",
    "Auto pasted upload": "剪切板自动上传",
    "If you set this value true, when you paste image, it will be auto uploaded(you should set the picGo server rightly)": "启用该选项后，黏贴图片时会自动上传（你需要正确配置picgo）",
    "Default uploader": "默认上传器",
    "PicGo server": "PicGo server 上传接口",
    "PicGo server desc": "上传接口，使用PicList时可通过设置URL参数指定图床和配置",
    "Please input PicGo server": "请输入上传接口地址",
    "PicGo delete server": "PicGo server 删除接口(请使用PicList来启用此功能)",
    "PicList desc": "PicList是PicGo二次开发版，请Github搜索PicList下载",
    "Please input PicGo delete server": "请输入删除接口地址",
    "Delete image using PicList": "使用 PicList 删除图片",
    "PicGo-Core path": "PicGo-Core 路径",
    "Delete successfully": "删除成功",
    "Delete failed": "删除失败",
    "Error, could not delete": "错误，无法删除",
    "Image size suffix": "图片大小后缀",
    "Image size suffix Description": "比如：|300 用于调整图片大小",
    "Please input image size suffix": "请输入图片大小后缀",
    "Please input PicGo-Core path, default using environment variables": "请输入 PicGo-Core path，默认使用环境变量",
    "Work on network": "应用网络图片",
    "Work on network Description": "当你上传所有图片时，也会上传网络图片。以及当你进行黏贴时，剪切板中的标准 md 图片会被上传",
    "Upload when clipboard has image and text together": "当剪切板同时拥有文本和图片剪切板数据时是否上传图片",
    "When you copy, some application like Excel will image and text to clipboard, you can upload or not.": "当你复制时，某些应用例如 Excel 会在剪切板同时文本和图像数据，确认是否上传。",
    "Network Domain Black List": "网络图片域名黑名单",
    "Network Domain Black List Description": "黑名单域名中的图片将不会被上传，用英文逗号分割",
    "Delete source file after you upload file": "上传文件后移除源文件",
    "Delete source file in ob assets after you upload file.": "上传文件后移除在ob附件文件夹中的文件",
    "Image desc": "图片描述",
    reserve: "默认",
    "remove all": "无",
    "remove default": "移除image.png",
    "Remote server mode": "远程服务器模式",
    "Remote server mode desc": "如果你在服务器部署了piclist-core或者piclist",
    "Can not find image file": "没有解析到图像文件",
    "File has been changedd, upload failure": "当前文件已变更，上传失败",
    "File has been changedd, download failure": "当前文件已变更，下载失败",
    "Warning: upload files is different of reciver files from api": "警告：上传的文件与接口返回的文件数量不一致",
    upload: "上传",
};

// 繁體中文
var zhTW = {};

const localeMap = {
    ar,
    cs: cz,
    da,
    de,
    en,
    'en-gb': enGB,
    es,
    fr,
    hi,
    id,
    it,
    ja,
    ko,
    nl,
    nn: no,
    pl,
    pt,
    'pt-br': ptBR,
    ro,
    ru,
    tr,
    'zh-cn': zhCN,
    'zh-tw': zhTW,
};
const locale = localeMap[obsidian.moment.locale()];
function t(str) {
    return (locale && locale[str]) || en[str];
}

async function downloadAllImageFiles(plugin) {
    const activeFile = plugin.app.workspace.getActiveFile();
    const folderPath = await plugin.app.fileManager.getAvailablePathForAttachment("");
    const fileArray = plugin.helper.getAllFiles();
    if (!(await plugin.app.vault.adapter.exists(folderPath))) {
        await plugin.app.vault.adapter.mkdir(folderPath);
    }
    let imageArray = [];
    for (const file of fileArray) {
        if (!file.path.startsWith("http")) {
            continue;
        }
        const url = file.path;
        const asset = getUrlAsset(url);
        let name = decodeURI(pathBrowserifyExports.parse(asset).name).replaceAll(/[\\\\/:*?\"<>|]/g, "-");
        const response = await download(plugin, url, folderPath, name);
        if (response.ok) {
            const activeFolder = plugin.app.workspace.getActiveFile().parent.path;
            imageArray.push({
                source: file.source,
                name: name,
                path: obsidian.normalizePath(pathBrowserifyExports.relative(obsidian.normalizePath(activeFolder), obsidian.normalizePath(response.path))),
            });
        }
    }
    let value = plugin.helper.getValue();
    imageArray.map(image => {
        let name = plugin.handleName(image.name);
        value = value.replace(image.source, `![${name}](${encodeURI(image.path)})`);
    });
    const currentFile = plugin.app.workspace.getActiveFile();
    if (activeFile.path !== currentFile.path) {
        new obsidian.Notice(t("File has been changedd, download failure"));
        return;
    }
    plugin.helper.setValue(value);
    new obsidian.Notice(`all: ${fileArray.length}\nsuccess: ${imageArray.length}\nfailed: ${fileArray.length - imageArray.length}`);
}
async function download(plugin, url, folderPath, name) {
    const response = await obsidian.requestUrl({ url });
    if (response.status !== 200) {
        return {
            ok: false,
            msg: "error",
        };
    }
    const type = await imageType(new Uint8Array(response.arrayBuffer));
    if (!type) {
        return {
            ok: false,
            msg: "error",
        };
    }
    try {
        let path = obsidian.normalizePath(pathBrowserifyExports.join(folderPath, `${name}.${type.ext}`));
        // 如果文件名已存在，则用随机值替换，不对文件后缀进行判断
        if (await plugin.app.vault.adapter.exists(path)) {
            path = obsidian.normalizePath(pathBrowserifyExports.join(folderPath, `${uuid()}.${type.ext}`));
        }
        plugin.app.vault.adapter.writeBinary(path, response.arrayBuffer);
        return {
            ok: true,
            msg: "ok",
            path: path,
            type,
        };
    }
    catch (err) {
        return {
            ok: false,
            msg: err,
        };
    }
}

const randomString = (length) => Array(length + 1)
    .join((Math.random().toString(36) + "00000000000000000").slice(2, 18))
    .slice(0, length);
async function payloadGenerator(payload_data) {
    const boundary_string = `Boundary${randomString(16)}`;
    const boundary = `------${boundary_string}`;
    const chunks = [];
    for (const [key, values] of Object.entries(payload_data)) {
        for (const value of Array.isArray(values) ? values : [values]) {
            chunks.push(new TextEncoder().encode(`${boundary}\r\n`));
            if (typeof value === "string") {
                chunks.push(new TextEncoder().encode(`Content-Disposition: form-data; name="${key}"\r\n\r\n${value}\r\n`));
            }
            else if (value instanceof File) {
                chunks.push(new TextEncoder().encode(`Content-Disposition: form-data; name="${key}"; filename="${value.name}"\r\nContent-Type: ${value.type || "application/octet-stream"}\r\n\r\n`));
                chunks.push(new Uint8Array(await obsidian.getBlobArrayBuffer(value)));
                chunks.push(new TextEncoder().encode("\r\n"));
            }
            else if (value instanceof Blob) {
                chunks.push(new TextEncoder().encode(`Content-Disposition: form-data; name="${key}"; filename="blob"\r\nContent-Type: ${value.type || "application/octet-stream"}\r\n\r\n`));
                chunks.push(new Uint8Array(await value.arrayBuffer()));
                chunks.push(new TextEncoder().encode("\r\n"));
            }
            else {
                chunks.push(new Uint8Array(await new Response(value).arrayBuffer()));
                chunks.push(new TextEncoder().encode("\r\n"));
            }
        }
    }
    chunks.push(new TextEncoder().encode(`${boundary}--\r\n`));
    const payload = new Blob(chunks, {
        type: "multipart/form-data; boundary=" + boundary_string,
    });
    return [await payload.arrayBuffer(), boundary_string];
}

class PicGoUploader {
    settings;
    plugin;
    constructor(plugin) {
        this.settings = plugin.settings;
        this.plugin = plugin;
    }
    async uploadFiles(fileList) {
        let response;
        if (this.settings.remoteServerMode) {
            const files = [];
            for (let i = 0; i < fileList.length; i++) {
                if (typeof fileList[i] === "string") {
                    const { readFile } = require("fs");
                    const file = fileList[i];
                    const buffer = await new Promise((resolve, reject) => {
                        readFile(file, (err, data) => {
                            if (err) {
                                reject(err);
                            }
                            resolve(data);
                        });
                    });
                    const arrayBuffer = bufferToArrayBuffer(buffer);
                    files.push(new File([arrayBuffer], file));
                }
                else {
                    const timestamp = new Date().getTime();
                    const image = fileList[i];
                    if (!image.file)
                        continue;
                    const arrayBuffer = await this.plugin.app.vault.adapter.readBinary(image.file.path);
                    files.push(new File([arrayBuffer], timestamp + pathBrowserifyExports.extname(image.file.path)));
                }
            }
            response = await this.uploadFileByData(files);
        }
        else {
            const basePath = this.plugin.app.vault.adapter.getBasePath();
            const list = fileList.map(item => {
                if (typeof item === "string") {
                    return item;
                }
                else {
                    return obsidian.normalizePath(pathBrowserifyExports.join(basePath, item.path));
                }
            });
            response = await obsidian.requestUrl({
                url: this.settings.uploadServer,
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ list: list }),
            });
        }
        return this.handleResponse(response);
    }
    async uploadFileByData(fileList) {
        const payload_data = {
            list: [],
        };
        for (let i = 0; i < fileList.length; i++) {
            const file = fileList[i];
            payload_data["list"].push(file);
        }
        const [request_body, boundary_string] = await payloadGenerator(payload_data);
        const options = {
            method: "POST",
            url: this.settings.uploadServer,
            contentType: `multipart/form-data; boundary=----${boundary_string}`,
            body: request_body,
        };
        const response = await obsidian.requestUrl(options);
        return response;
    }
    async uploadFileByClipboard(fileList) {
        let res;
        if (this.settings.remoteServerMode) {
            const files = [];
            for (let i = 0; i < fileList.length; i++) {
                const timestamp = new Date().getTime();
                const file = fileList[i];
                const arrayBuffer = await file.arrayBuffer();
                files.push(new File([arrayBuffer], timestamp + ".png"));
            }
            res = await this.uploadFileByData(files);
        }
        else {
            res = await obsidian.requestUrl({
                url: this.settings.uploadServer,
                method: "POST",
            });
        }
        return this.handleResponse(res);
    }
    /**
     * 处理返回值
     */
    async handleResponse(response) {
        const data = (await response.json);
        if (response.status !== 200) {
            console.error(response, data);
            return {
                success: false,
                msg: data.msg || data.message,
                result: [],
            };
        }
        if (data.success === false) {
            console.error(response, data);
            return {
                success: false,
                msg: data.msg || data.message,
                result: [],
            };
        }
        // piclist
        if (data.fullResult) {
            const uploadUrlFullResultList = data.fullResult || [];
            this.settings.uploadedImages = [
                ...(this.settings.uploadedImages || []),
                ...uploadUrlFullResultList,
            ];
            this.plugin.saveSettings();
        }
        return {
            success: true,
            msg: "success",
            result: typeof data.result == "string" ? [data.result] : data.result,
        };
    }
    async upload(fileList) {
        return this.uploadFiles(fileList);
    }
    async uploadByClipboard(fileList) {
        return this.uploadFileByClipboard(fileList);
    }
}

class PicGoCoreUploader {
    settings;
    plugin;
    constructor(plugin) {
        this.settings = plugin.settings;
        this.plugin = plugin;
    }
    async uploadFiles(fileList) {
        const basePath = this.plugin.app.vault.adapter.getBasePath();
        const list = fileList.map(item => {
            if (typeof item === "string") {
                return item;
            }
            else {
                return obsidian.normalizePath(pathBrowserifyExports.join(basePath, item.path));
            }
        });
        const length = list.length;
        let cli = this.settings.picgoCorePath || "picgo";
        let command = `${cli} upload ${list.map(item => `"${item}"`).join(" ")}`;
        const res = await this.exec(command);
        const splitList = res.split("\n");
        const splitListLength = splitList.length;
        const data = splitList.splice(splitListLength - 1 - length, length);
        if (res.includes("PicGo ERROR")) {
            console.log(command, res);
            return {
                success: false,
                msg: "失败",
                result: [],
            };
        }
        else {
            return {
                success: true,
                result: data,
            };
        }
    }
    // PicGo-Core 上传处理
    async uploadFileByClipboard() {
        const res = await this.uploadByClip();
        const splitList = res.split("\n");
        const lastImage = getLastImage(splitList);
        if (lastImage) {
            return {
                success: true,
                msg: "success",
                result: [lastImage],
            };
        }
        else {
            console.log(splitList);
            return {
                success: false,
                msg: `"Please check PicGo-Core config"\n${res}`,
                result: [],
            };
        }
    }
    // PicGo-Core的剪切上传反馈
    async uploadByClip() {
        let command;
        if (this.settings.picgoCorePath) {
            command = `${this.settings.picgoCorePath} upload`;
        }
        else {
            command = `picgo upload`;
        }
        const res = await this.exec(command);
        return res;
    }
    async exec(command) {
        const { exec } = require("child_process");
        let { stdout } = await exec(command);
        const res = await streamToString(stdout);
        return res;
    }
    async spawnChild() {
        const { spawn } = require("child_process");
        const child = spawn("picgo", ["upload"], {
            shell: true,
        });
        let data = "";
        for await (const chunk of child.stdout) {
            data += chunk;
        }
        let error = "";
        for await (const chunk of child.stderr) {
            error += chunk;
        }
        const exitCode = await new Promise((resolve, reject) => {
            child.on("close", resolve);
        });
        if (exitCode) {
            throw new Error(`subprocess error exit ${exitCode}, ${error}`);
        }
        return data;
    }
    async upload(fileList) {
        return this.uploadFiles(fileList);
    }
    async uploadByClipboard(fileList) {
        console.log("uploadByClipboard", fileList);
        return this.uploadFileByClipboard();
    }
}

function getUploader(uploader) {
    switch (uploader) {
        case "PicGo":
            return PicGoUploader;
        case "PicGo-Core":
            return PicGoCoreUploader;
        default:
            throw new Error("Invalid uploader");
    }
}
class UploaderManager {
    uploader;
    plugin;
    constructor(uploader, plugin) {
        this.plugin = plugin;
        const Uploader = getUploader(uploader);
        this.uploader = new Uploader(this.plugin);
    }
    async upload(fileList) {
        if (obsidian.Platform.isMobileApp && !this.plugin.settings.remoteServerMode) {
            new obsidian.Notice("Mobile App must use remote server mode.");
            throw new Error("Mobile App must use remote server mode.");
        }
        const res = await this.uploader.upload(fileList);
        if (!res.success) {
            new obsidian.Notice(res.msg || "Upload Failed");
            throw new Error(res.msg || "Upload Failed");
        }
        return res;
    }
    async uploadByClipboard(fileList) {
        if (obsidian.Platform.isMobileApp && !this.plugin.settings.remoteServerMode) {
            new obsidian.Notice("Mobile App must use remote server mode.");
            throw new Error("Mobile App must use remote server mode.");
        }
        const res = await this.uploader.uploadByClipboard(fileList);
        if (!res.success) {
            new obsidian.Notice(res.msg || "Upload Failed");
            throw new Error(res.msg || "Upload Failed");
        }
        return res;
    }
}

class PicGoDeleter {
    plugin;
    constructor(plugin) {
        this.plugin = plugin;
    }
    async deleteImage(configMap) {
        const response = await obsidian.requestUrl({
            url: this.plugin.settings.deleteServer,
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                list: configMap,
            }),
        });
        const data = response.json;
        return data;
    }
}

// ![](./dsa/aa.png) local image should has ext, support ![](<./dsa/aa.png>), support ![](image.png "alt")
// ![](https://dasdasda) internet image should not has ext
const REGEX_FILE = /\!\[(.*?)\]\(<(\S+\.\w+)>\)|\!\[(.*?)\]\((\S+\.\w+)(?:\s+"[^"]*")?\)|\!\[(.*?)\]\((https?:\/\/.*?)\)/g;
const REGEX_WIKI_FILE = /\!\[\[(.*?)(\s*?\|.*?)?\]\]/g;
class Helper {
    app;
    constructor(app) {
        this.app = app;
    }
    getFrontmatterValue(key, defaultValue = undefined) {
        const file = this.app.workspace.getActiveFile();
        if (!file) {
            return undefined;
        }
        const path = file.path;
        const cache = this.app.metadataCache.getCache(path);
        let value = defaultValue;
        if (cache?.frontmatter && cache.frontmatter.hasOwnProperty(key)) {
            value = cache.frontmatter[key];
        }
        return value;
    }
    getEditor() {
        const mdView = this.app.workspace.getActiveViewOfType(obsidian.MarkdownView);
        if (mdView) {
            return mdView.editor;
        }
        else {
            return null;
        }
    }
    getValue() {
        const editor = this.getEditor();
        return editor.getValue();
    }
    setValue(value) {
        const editor = this.getEditor();
        const { left, top } = editor.getScrollInfo();
        const position = editor.getCursor();
        editor.setValue(value);
        editor.scrollTo(left, top);
        editor.setCursor(position);
    }
    // get all file urls, include local and internet
    getAllFiles() {
        const editor = this.getEditor();
        let value = editor.getValue();
        return this.getImageLink(value);
    }
    getImageLink(value) {
        const matches = value.matchAll(REGEX_FILE);
        const WikiMatches = value.matchAll(REGEX_WIKI_FILE);
        let fileArray = [];
        for (const match of matches) {
            const source = match[0];
            let name = match[1];
            let path = match[2];
            if (name === undefined) {
                name = match[3];
            }
            if (path === undefined) {
                path = match[4];
            }
            fileArray.push({
                path: path,
                name: name,
                source: source,
            });
        }
        for (const match of WikiMatches) {
            let name = pathBrowserifyExports.parse(match[1]).name;
            const path = match[1];
            const source = match[0];
            if (match[2]) {
                name = `${name}${match[2]}`;
            }
            fileArray.push({
                path: path,
                name: name,
                source: source,
            });
        }
        return fileArray;
    }
    hasBlackDomain(src, blackDomains) {
        if (blackDomains.trim() === "") {
            return false;
        }
        const blackDomainList = blackDomains.split(",").filter(item => item !== "");
        let url = new URL(src);
        const domain = url.hostname;
        return blackDomainList.some(blackDomain => domain.includes(blackDomain));
    }
}

const DEFAULT_SETTINGS = {
    uploadByClipSwitch: true,
    uploader: "PicGo",
    uploadServer: "http://127.0.0.1:36677/upload",
    deleteServer: "http://127.0.0.1:36677/delete",
    imageSizeSuffix: "",
    picgoCorePath: "",
    workOnNetWork: false,
    applyImage: true,
    newWorkBlackDomains: "",
    deleteSource: false,
    imageDesc: "origin",
    remoteServerMode: false,
    addPandocFig: false,
    addNewLineAroundImage: true, // [新增] 默认开启自动换行
    pandocImageWidth: "14cm",
};
class SettingTab extends obsidian.PluginSettingTab {
    plugin;
    constructor(app, plugin) {
        super(app, plugin);
        this.plugin = plugin;
    }
    display() {
        let { containerEl } = this;
        containerEl.empty();
        containerEl.createEl("h2", { text: t("Plugin Settings") });
        new obsidian.Setting(containerEl)
            .setName(t("Auto pasted upload"))
            .setDesc(t("If you set this value true, when you paste image, it will be auto uploaded(you should set the picGo server rightly)"))
            .addToggle(toggle => toggle
            .setValue(this.plugin.settings.uploadByClipSwitch)
            .onChange(async (value) => {
            this.plugin.settings.uploadByClipSwitch = value;
            await this.plugin.saveSettings();
        }));
        new obsidian.Setting(containerEl)
            .setName(t("Default uploader"))
            .setDesc(t("Default uploader"))
            .addDropdown(cb => cb
            .addOption("PicGo", "PicGo(app)")
            .addOption("PicGo-Core", "PicGo-Core")
            .setValue(this.plugin.settings.uploader)
            .onChange(async (value) => {
            this.plugin.settings.uploader = value;
            this.display();
            await this.plugin.saveSettings();
        }));
        if (this.plugin.settings.uploader === "PicGo") {
            new obsidian.Setting(containerEl)
                .setName(t("PicGo server"))
                .setDesc(t("PicGo server desc"))
                .addText(text => text
                .setPlaceholder(t("Please input PicGo server"))
                .setValue(this.plugin.settings.uploadServer)
                .onChange(async (key) => {
                this.plugin.settings.uploadServer = key;
                await this.plugin.saveSettings();
            }));
            new obsidian.Setting(containerEl)
                .setName(t("PicGo delete server"))
                .setDesc(t("PicList desc"))
                .addText(text => text
                .setPlaceholder(t("Please input PicGo delete server"))
                .setValue(this.plugin.settings.deleteServer)
                .onChange(async (key) => {
                this.plugin.settings.deleteServer = key;
                await this.plugin.saveSettings();
            }));
        }
        new obsidian.Setting(containerEl)
            .setName(t("Remote server mode"))
            .setDesc(t("Remote server mode desc"))
            .addToggle(toggle => toggle
            .setValue(this.plugin.settings.remoteServerMode)
            .onChange(async (value) => {
            this.plugin.settings.remoteServerMode = value;
            if (value) {
                this.plugin.settings.workOnNetWork = false;
            }
            this.display();
            await this.plugin.saveSettings();
        }));
        if (this.plugin.settings.uploader === "PicGo-Core") {
            new obsidian.Setting(containerEl)
                .setName(t("PicGo-Core path"))
                .setDesc(t("Please input PicGo-Core path, default using environment variables"))
                .addText(text => text
                .setPlaceholder("")
                .setValue(this.plugin.settings.picgoCorePath)
                .onChange(async (value) => {
                this.plugin.settings.picgoCorePath = value;
                await this.plugin.saveSettings();
            }));
        }
        // image desc setting
        new obsidian.Setting(containerEl)
            .setName(t("Image desc"))
            .setDesc(t("Image desc"))
            .addDropdown(cb => cb
            .addOption("origin", t("reserve")) // 保留全部
            .addOption("none", t("remove all")) // 移除全部
            .addOption("removeDefault", t("remove default")) // 只移除默认即 image.png
            .setValue(this.plugin.settings.imageDesc)
            .onChange(async (value) => {
            this.plugin.settings.imageDesc = value;
            this.display();
            await this.plugin.saveSettings();
        }));
        new obsidian.Setting(containerEl)
            .setName(t("Image size suffix"))
            .setDesc(t("Image size suffix Description"))
            .addText(text => text
            .setPlaceholder(t("Please input image size suffix"))
            .setValue(this.plugin.settings.imageSizeSuffix)
            .onChange(async (key) => {
            this.plugin.settings.imageSizeSuffix = key;
            await this.plugin.saveSettings();
        }));
        new obsidian.Setting(containerEl)
            .setName(t("Work on network"))
            .setDesc(t("Work on network Description"))
            .addToggle(toggle => toggle
            .setValue(this.plugin.settings.workOnNetWork)
            .onChange(async (value) => {
            if (this.plugin.settings.remoteServerMode) {
                new obsidian.Notice("Can only work when remote server mode is off.");
                this.plugin.settings.workOnNetWork = false;
            }
            else {
                this.plugin.settings.workOnNetWork = value;
            }
            this.display();
            await this.plugin.saveSettings();
        }));
        new obsidian.Setting(containerEl)
            .setName(t("Network Domain Black List"))
            .setDesc(t("Network Domain Black List Description"))
            .addTextArea(textArea => textArea
            .setValue(this.plugin.settings.newWorkBlackDomains)
            .onChange(async (value) => {
            this.plugin.settings.newWorkBlackDomains = value;
            await this.plugin.saveSettings();
        }));
        new obsidian.Setting(containerEl)
            .setName(t("Upload when clipboard has image and text together"))
            .setDesc(t("When you copy, some application like Excel will image and text to clipboard, you can upload or not."))
            .addToggle(toggle => toggle
            .setValue(this.plugin.settings.applyImage)
            .onChange(async (value) => {
            this.plugin.settings.applyImage = value;
            this.display();
            await this.plugin.saveSettings();
        }));
        new obsidian.Setting(containerEl)
            .setName(t("Delete source file after you upload file"))
            .setDesc(t("Delete source file in ob assets after you upload file."))
            .addToggle(toggle => toggle
            .setValue(this.plugin.settings.deleteSource)
            .onChange(async (value) => {
            this.plugin.settings.deleteSource = value;
            this.display();
            await this.plugin.saveSettings();
        }));
        new obsidian.Setting(containerEl)
            .setName('启用 Pandoc Fig 格式')
            .setDesc('开启后，上传图片将生成 ![Alt](Url){#fig:时间戳} 格式')
            .addToggle((toggle) => {
            toggle
                .setValue(this.plugin.settings.addPandocFig)
                .onChange(async (value) => {
                this.plugin.settings.addPandocFig = value;
                await this.plugin.saveSettings();
            });
        });
        new obsidian.Setting(containerEl)
            .setName("图片前后添加空行")
            .setDesc("开启后，生成的图床链接前后会自动包裹两个换行符")
            .addToggle((toggle) => toggle
            .setValue(this.plugin.settings.addNewLineAroundImage)
            .onChange(async (value) => {
            this.plugin.settings.addNewLineAroundImage = value;
            await this.plugin.saveSettings();
        }));
        // --- [新增：Pandoc 图片宽度] ---
        new obsidian.Setting(containerEl)
            .setName("Pandoc 图片宽度")
            .setDesc("设置 Pandoc 导出时的图片宽度，例如: 14cm 或 80%。需配合 Pandoc Fig 格式使用。")
            .addText((text) => text
            .setPlaceholder("14cm")
            .setValue(this.plugin.settings.pandocImageWidth)
            .onChange(async (value) => {
            this.plugin.settings.pandocImageWidth = value;
            await this.plugin.saveSettings();
        }));
    }
}

class imageAutoUploadPlugin extends obsidian.Plugin {
    settings;
    helper;
    editor;
    picGoDeleter;
    async loadSettings() {
        this.settings = Object.assign(DEFAULT_SETTINGS, await this.loadData());
    }
    async saveSettings() {
        await this.saveData(this.settings);
    }
    onunload() { }
    async onload() {
        await this.loadSettings();
        this.helper = new Helper(this.app);
        this.picGoDeleter = new PicGoDeleter(this);
        obsidian.addIcon("upload", `<svg t="1636630783429" class="icon" viewBox="0 0 100 100" version="1.1" p-id="4649" xmlns="http://www.w3.org/2000/svg">
      <path d="M 71.638 35.336 L 79.408 35.336 C 83.7 35.336 87.178 38.662 87.178 42.765 L 87.178 84.864 C 87.178 88.969 83.7 92.295 79.408 92.295 L 17.249 92.295 C 12.957 92.295 9.479 88.969 9.479 84.864 L 9.479 42.765 C 9.479 38.662 12.957 35.336 17.249 35.336 L 25.019 35.336 L 25.019 42.765 L 17.249 42.765 L 17.249 84.864 L 79.408 84.864 L 79.408 42.765 L 71.638 42.765 L 71.638 35.336 Z M 49.014 10.179 L 67.326 27.688 L 61.835 32.942 L 52.849 24.352 L 52.849 59.731 L 45.078 59.731 L 45.078 24.455 L 36.194 32.947 L 30.702 27.692 L 49.012 10.181 Z" p-id="4650" fill="#8a8a8a"></path>
    </svg>`);
        this.addSettingTab(new SettingTab(this.app, this));
        this.addCommand({
            id: "Upload all images",
            name: "Upload all images",
            checkCallback: (checking) => {
                let leaf = this.app.workspace.getActiveViewOfType(obsidian.MarkdownView);
                if (leaf) {
                    if (!checking) {
                        this.uploadAllFile();
                    }
                    return true;
                }
                return false;
            },
        });
        this.addCommand({
            id: "Download all images",
            name: "Download all images",
            checkCallback: (checking) => {
                let leaf = this.app.workspace.getActiveViewOfType(obsidian.MarkdownView);
                if (leaf) {
                    if (!checking) {
                        downloadAllImageFiles(this);
                    }
                    return true;
                }
                return false;
            },
        });
        this.setupPasteHandler();
        this.registerFileMenu();
        this.registerSelection();
    }
    /**
     * 获取当前使用的上传器
     */
    getUploader() {
        const uploader = new UploaderManager(this.settings.uploader, this);
        return uploader;
    }
    /**
     * 上传图片
     */
    upload(images) {
        let uploader = this.getUploader();
        return uploader.upload(images);
    }
    /**
     * 通过剪贴板上传图片
     */
    uploadByClipboard(fileList) {
        let uploader = this.getUploader();
        return uploader.uploadByClipboard(fileList);
    }
    registerSelection() {
        this.registerEvent(this.app.workspace.on("editor-menu", (menu, editor, info) => {
            if (this.app.workspace.getLeavesOfType("markdown").length === 0) {
                return;
            }
            const selection = editor.getSelection();
            if (selection) {
                const markdownRegex = /!\[.*\]\((.*)\)/g;
                const markdownMatch = markdownRegex.exec(selection);
                if (markdownMatch && markdownMatch.length > 1) {
                    const markdownUrl = markdownMatch[1];
                    if (this.settings.uploadedImages.find((item) => item.imgUrl === markdownUrl)) {
                        this.addRemoveMenu(menu, markdownUrl, editor);
                    }
                }
            }
        }));
    }
    addRemoveMenu = (menu, imgPath, editor) => {
        menu.addItem((item) => item
            .setIcon("trash-2")
            .setTitle(t("Delete image using PicList"))
            .onClick(async () => {
            try {
                const selectedItem = this.settings.uploadedImages.find((item) => item.imgUrl === imgPath);
                if (selectedItem) {
                    const res = await this.picGoDeleter.deleteImage([selectedItem]);
                    if (res.success) {
                        new obsidian.Notice(t("Delete successfully"));
                        const selection = editor.getSelection();
                        if (selection) {
                            editor.replaceSelection("");
                        }
                        this.settings.uploadedImages =
                            this.settings.uploadedImages.filter((item) => item.imgUrl !== imgPath);
                        this.saveSettings();
                    }
                    else {
                        new obsidian.Notice(t("Delete failed"));
                    }
                }
            }
            catch {
                new obsidian.Notice(t("Error, could not delete"));
            }
        }));
    };
    registerFileMenu() {
        this.registerEvent(this.app.workspace.on("file-menu", (menu, file, source, leaf) => {
            if (source === "canvas-menu")
                return false;
            if (!isAssetTypeAnImage(file.path))
                return false;
            menu.addItem((item) => {
                item
                    .setTitle(t("upload"))
                    .setIcon("upload")
                    .onClick(() => {
                    if (!(file instanceof obsidian.TFile)) {
                        return false;
                    }
                    this.fileMenuUpload(file);
                });
            });
        }));
    }
    fileMenuUpload(file) {
        let imageList = [];
        const fileArray = this.helper.getAllFiles();
        for (const match of fileArray) {
            const imageName = match.name;
            const encodedUri = match.path;
            const fileName = pathBrowserifyExports.basename(decodeURI(encodedUri));
            if (file && file.name === fileName) {
                if (isAssetTypeAnImage(file.path)) {
                    imageList.push({
                        path: file.path,
                        name: imageName,
                        source: match.source,
                        file: file,
                    });
                }
            }
        }
        if (imageList.length === 0) {
            new obsidian.Notice(t("Can not find image file"));
            return;
        }
        this.upload(imageList).then(res => {
            if (!res.success) {
                new obsidian.Notice("Upload error");
                return;
            }
            let uploadUrlList = res.result;
            this.replaceImage(imageList, uploadUrlList);
        });
    }
    filterFile(fileArray) {
        const imageList = [];
        for (const match of fileArray) {
            if (match.path.startsWith("http")) {
                if (this.settings.workOnNetWork) {
                    if (!this.helper.hasBlackDomain(match.path, this.settings.newWorkBlackDomains)) {
                        imageList.push({
                            path: match.path,
                            name: match.name,
                            source: match.source,
                        });
                    }
                }
            }
            else {
                imageList.push({
                    path: match.path,
                    name: match.name,
                    source: match.source,
                });
            }
        }
        return imageList;
    }
    /**
     * 替换上传的图片
     */
    replaceImage(imageList, uploadUrlList) {
        let content = this.helper.getValue();
        // --- 【修改开始：增加 index 参数】 ---
        imageList.map((item, index) => {
            const uploadImage = uploadUrlList.shift();
            let name = this.handleName(item.name);
            let replacement = "";
            if (this.settings.addPandocFig) {
                // 自动生成时间戳 ID
                const timestamp = window.moment().format("YYYYMMDDHHmmss") + (index > 0 ? `-${index}` : "");
                // 【关键修改】：从设置读取宽度并放入 {#fig:...} 内部
                const width = this.settings.pandocImageWidth || "14cm";
                replacement = `![${name}](${uploadImage}){#fig:${timestamp} width=${width}}`;
            }
            else {
                replacement = `![${name}](${uploadImage})`;
            }
            // 【关键修改】：统一添加空行逻辑
            if (this.settings.addNewLineAroundImage) {
                replacement = `\n\n${replacement}\n\n`;
            }
            // 注意：这里用 replacement 替换原来的图片链接
            content = content.replaceAll(item.source, replacement);
        });
        // --- 【修改结束】 ---
        this.helper.setValue(content);
        if (this.settings.deleteSource) {
            imageList.map(image => {
                if (image.file && !image.path.startsWith("http")) {
                    this.app.fileManager.trashFile(image.file);
                }
            });
        }
    }
    /**
     * 上传所有图片
     */
    uploadAllFile() {
        const activeFile = this.app.workspace.getActiveFile();
        const fileMap = arrayToObject(this.app.vault.getFiles(), "name");
        const filePathMap = arrayToObject(this.app.vault.getFiles(), "path");
        let imageList = [];
        const fileArray = this.filterFile(this.helper.getAllFiles());
        for (const match of fileArray) {
            const imageName = match.name;
            const uri = decodeURI(match.path);
            if (uri.startsWith("http")) {
                imageList.push({
                    path: match.path,
                    name: imageName,
                    source: match.source,
                    file: null,
                });
            }
            else {
                const fileName = pathBrowserifyExports.basename(uri);
                let file;
                // 优先匹配绝对路径
                if (filePathMap[uri]) {
                    file = filePathMap[uri];
                }
                // 相对路径
                if ((!file && uri.startsWith("./")) || uri.startsWith("../")) {
                    const filePath = obsidian.normalizePath(pathBrowserifyExports.resolve(pathBrowserifyExports.dirname(activeFile.path), uri));
                    file = filePathMap[filePath];
                }
                // 尽可能短路径
                if (!file) {
                    file = fileMap[fileName];
                }
                if (file) {
                    if (isAssetTypeAnImage(file.path)) {
                        imageList.push({
                            path: obsidian.normalizePath(file.path),
                            name: imageName,
                            source: match.source,
                            file: file,
                        });
                    }
                }
            }
        }
        if (imageList.length === 0) {
            new obsidian.Notice(t("Can not find image file"));
            return;
        }
        else {
            new obsidian.Notice(`Have found ${imageList.length} images`);
        }
        this.upload(imageList).then(res => {
            let uploadUrlList = res.result;
            if (imageList.length !== uploadUrlList.length) {
                new obsidian.Notice(t("Warning: upload files is different of reciver files from api"));
                return;
            }
            const currentFile = this.app.workspace.getActiveFile();
            if (activeFile.path !== currentFile.path) {
                new obsidian.Notice(t("File has been changedd, upload failure"));
                return;
            }
            this.replaceImage(imageList, uploadUrlList);
        });
    }
    setupPasteHandler() {
        this.registerEvent(this.app.workspace.on("editor-paste", (evt, editor, markdownView) => {
            const allowUpload = this.helper.getFrontmatterValue("image-auto-upload", this.settings.uploadByClipSwitch);
            evt.clipboardData.files;
            if (!allowUpload) {
                return;
            }
            // 剪贴板内容有md格式的图片时
            if (this.settings.workOnNetWork) {
                const clipboardValue = evt.clipboardData.getData("text/plain");
                const imageList = this.helper
                    .getImageLink(clipboardValue)
                    .filter(image => image.path.startsWith("http"))
                    .filter(image => !this.helper.hasBlackDomain(image.path, this.settings.newWorkBlackDomains));
                if (imageList.length !== 0) {
                    this.upload(imageList).then(res => {
                        let uploadUrlList = res.result;
                        this.replaceImage(imageList, uploadUrlList);
                    });
                }
            }
            // 剪贴板中是图片时进行上传
            if (this.canUpload(evt.clipboardData)) {
                this.uploadFileAndEmbedImgurImage(editor, async (editor, pasteId) => {
                    let res;
                    res = await this.uploadByClipboard(evt.clipboardData.files);
                    if (res.success) {
                        // PicGo 返回的是 result 数组，取第一个作为 URL
                        return res.result ? res.result[0] : res.data;
                    }
                    // 如果没有 success 字段，再回退去判断 code (兼容旧逻辑)
                    if (res.code !== undefined && res.code !== 0) {
                        this.handleFailedUpload(editor, pasteId, res.msg);
                        return;
                    }
                    const url = res.data;
                    return url;
                }, evt.clipboardData).catch();
                evt.preventDefault();
            }
        }));
        this.registerEvent(this.app.workspace.on("editor-drop", async (evt, editor, markdownView) => {
            // when ctrl key is pressed, do not upload image, because it is used to set local file
            if (evt.ctrlKey) {
                return;
            }
            const allowUpload = this.helper.getFrontmatterValue("image-auto-upload", this.settings.uploadByClipSwitch);
            if (!allowUpload) {
                return;
            }
            let files = evt.dataTransfer.files;
            if (files.length !== 0 && files[0].type.startsWith("image")) {
                let sendFiles = [];
                let files = evt.dataTransfer.files;
                Array.from(files).forEach((item, index) => {
                    if (item.path) {
                        sendFiles.push(item.path);
                    }
                    else {
                        const { webUtils } = require("electron");
                        const path = webUtils.getPathForFile(item);
                        sendFiles.push(path);
                    }
                });
                evt.preventDefault();
                const data = await this.upload(sendFiles);
                if (data.success) {
                    data.result.map((value) => {
                        let pasteId = (Math.random() + 1).toString(36).substr(2, 5);
                        this.insertTemporaryText(editor, pasteId);
                        this.embedMarkDownImage(editor, pasteId, value, files[0].name);
                    });
                }
                else {
                    new obsidian.Notice("Upload error");
                }
            }
        }));
    }
    canUpload(clipboardData) {
        this.settings.applyImage;
        const files = clipboardData.files;
        const text = clipboardData.getData("text");
        const hasImageFile = files.length !== 0 && files[0].type.startsWith("image");
        if (hasImageFile) {
            if (!!text) {
                return this.settings.applyImage;
            }
            else {
                return true;
            }
        }
        else {
            return false;
        }
    }
    async uploadFileAndEmbedImgurImage(editor, callback, clipboardData) {
        let pasteId = (Math.random() + 1).toString(36).substr(2, 5);
        this.insertTemporaryText(editor, pasteId);
        const name = clipboardData.files[0].name;
        try {
            const url = await callback(editor, pasteId);
            this.embedMarkDownImage(editor, pasteId, url, name);
        }
        catch (e) {
            this.handleFailedUpload(editor, pasteId, e);
        }
    }
    insertTemporaryText(editor, pasteId) {
        let progressText = imageAutoUploadPlugin.progressTextFor(pasteId);
        editor.replaceSelection(progressText);
    }
    static progressTextFor(id) {
        return `![Uploading file...${id}]()`;
    }
    embedMarkDownImage(editor, pasteId, imageUrl, name = "") {
        let progressText = imageAutoUploadPlugin.progressTextFor(pasteId);
        name = this.handleName(name);
        let markDownImage = "";
        if (this.settings.addPandocFig) {
            const timestamp = window.moment().format("YYYYMMDDHHmmss");
            // 【关键修改】：添加 width 参数
            const width = this.settings.pandocImageWidth || "14cm";
            markDownImage = `![${name}](${imageUrl}){#fig:${timestamp} width=${width}}`;
        }
        else {
            markDownImage = `![${name}](${imageUrl})`;
        }
        // 【关键修改】：添加空行逻辑
        if (this.settings.addNewLineAroundImage) {
            markDownImage = `\n\n${markDownImage}\n\n`;
        }
        // --- 【修改结束】 ---
        imageAutoUploadPlugin.replaceFirstOccurrence(editor, progressText, markDownImage);
    }
    handleFailedUpload(editor, pasteId, reason) {
        new obsidian.Notice(reason);
        console.error("Failed request: ", reason);
        let progressText = imageAutoUploadPlugin.progressTextFor(pasteId);
        imageAutoUploadPlugin.replaceFirstOccurrence(editor, progressText, "⚠️upload failed, check dev console");
    }
    handleName(name) {
        const imageSizeSuffix = this.settings.imageSizeSuffix || "";
        if (this.settings.imageDesc === "origin") {
            return `${name}${imageSizeSuffix}`;
        }
        else if (this.settings.imageDesc === "none") {
            return "";
        }
        else if (this.settings.imageDesc === "removeDefault") {
            if (name === "image.png") {
                return "";
            }
            else {
                return `${name}${imageSizeSuffix}`;
            }
        }
        else {
            return `${name}${imageSizeSuffix}`;
        }
    }
    static replaceFirstOccurrence(editor, target, replacement) {
        let lines = editor.getValue().split("\n");
        for (let i = 0; i < lines.length; i++) {
            let ch = lines[i].indexOf(target);
            if (ch != -1) {
                let from = { line: i, ch: ch };
                let to = { line: i, ch: ch + target.length };
                editor.replaceRange(replacement, from, to);
                break;
            }
        }
    }
}

module.exports = imageAutoUploadPlugin;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWFpbi5qcyIsInNvdXJjZXMiOlsibm9kZV9tb2R1bGVzLy5wbnBtL3BhdGgtYnJvd3NlcmlmeUAxLjAuMS9ub2RlX21vZHVsZXMvcGF0aC1icm93c2VyaWZ5L2luZGV4LmpzIiwic3JjL3V0aWxzLnRzIiwibm9kZV9tb2R1bGVzLy5wbnBtL3Rva2VuLXR5cGVzQDUuMC4xL25vZGVfbW9kdWxlcy90b2tlbi10eXBlcy9saWIvaW5kZXguanMiLCJub2RlX21vZHVsZXMvLnBucG0vcGVlay1yZWFkYWJsZUA1LjMuMS9ub2RlX21vZHVsZXMvcGVlay1yZWFkYWJsZS9saWIvRW5kT2ZTdHJlYW1FcnJvci5qcyIsIm5vZGVfbW9kdWxlcy8ucG5wbS9wZWVrLXJlYWRhYmxlQDUuMy4xL25vZGVfbW9kdWxlcy9wZWVrLXJlYWRhYmxlL2xpYi9EZWZlcnJlZC5qcyIsIm5vZGVfbW9kdWxlcy8ucG5wbS9wZWVrLXJlYWRhYmxlQDUuMy4xL25vZGVfbW9kdWxlcy9wZWVrLXJlYWRhYmxlL2xpYi9BYnN0cmFjdFN0cmVhbVJlYWRlci5qcyIsIm5vZGVfbW9kdWxlcy8ucG5wbS9wZWVrLXJlYWRhYmxlQDUuMy4xL25vZGVfbW9kdWxlcy9wZWVrLXJlYWRhYmxlL2xpYi9TdHJlYW1SZWFkZXIuanMiLCJub2RlX21vZHVsZXMvLnBucG0vc3RydG9rM0A3LjEuMS9ub2RlX21vZHVsZXMvc3RydG9rMy9saWIvQWJzdHJhY3RUb2tlbml6ZXIuanMiLCJub2RlX21vZHVsZXMvLnBucG0vc3RydG9rM0A3LjEuMS9ub2RlX21vZHVsZXMvc3RydG9rMy9saWIvUmVhZFN0cmVhbVRva2VuaXplci5qcyIsIm5vZGVfbW9kdWxlcy8ucG5wbS9zdHJ0b2szQDcuMS4xL25vZGVfbW9kdWxlcy9zdHJ0b2szL2xpYi9CdWZmZXJUb2tlbml6ZXIuanMiLCJub2RlX21vZHVsZXMvLnBucG0vc3RydG9rM0A3LjEuMS9ub2RlX21vZHVsZXMvc3RydG9rMy9saWIvY29yZS5qcyIsIm5vZGVfbW9kdWxlcy8ucG5wbS9maWxlLXR5cGVAMTguNy4wL25vZGVfbW9kdWxlcy9maWxlLXR5cGUvdXRpbC5qcyIsIm5vZGVfbW9kdWxlcy8ucG5wbS9maWxlLXR5cGVAMTguNy4wL25vZGVfbW9kdWxlcy9maWxlLXR5cGUvc3VwcG9ydGVkLmpzIiwibm9kZV9tb2R1bGVzLy5wbnBtL2ZpbGUtdHlwZUAxOC43LjAvbm9kZV9tb2R1bGVzL2ZpbGUtdHlwZS9jb3JlLmpzIiwibm9kZV9tb2R1bGVzLy5wbnBtL2ltYWdlLXR5cGVANS4yLjAvbm9kZV9tb2R1bGVzL2ltYWdlLXR5cGUvaW5kZXguanMiLCJzcmMvbGFuZy9sb2NhbGUvYXIudHMiLCJzcmMvbGFuZy9sb2NhbGUvY3oudHMiLCJzcmMvbGFuZy9sb2NhbGUvZGEudHMiLCJzcmMvbGFuZy9sb2NhbGUvZGUudHMiLCJzcmMvbGFuZy9sb2NhbGUvZW4udHMiLCJzcmMvbGFuZy9sb2NhbGUvZW4tZ2IudHMiLCJzcmMvbGFuZy9sb2NhbGUvZXMudHMiLCJzcmMvbGFuZy9sb2NhbGUvZnIudHMiLCJzcmMvbGFuZy9sb2NhbGUvaGkudHMiLCJzcmMvbGFuZy9sb2NhbGUvaWQudHMiLCJzcmMvbGFuZy9sb2NhbGUvaXQudHMiLCJzcmMvbGFuZy9sb2NhbGUvamEudHMiLCJzcmMvbGFuZy9sb2NhbGUva28udHMiLCJzcmMvbGFuZy9sb2NhbGUvbmwudHMiLCJzcmMvbGFuZy9sb2NhbGUvbm8udHMiLCJzcmMvbGFuZy9sb2NhbGUvcGwudHMiLCJzcmMvbGFuZy9sb2NhbGUvcHQudHMiLCJzcmMvbGFuZy9sb2NhbGUvcHQtYnIudHMiLCJzcmMvbGFuZy9sb2NhbGUvcm8udHMiLCJzcmMvbGFuZy9sb2NhbGUvcnUudHMiLCJzcmMvbGFuZy9sb2NhbGUvdHIudHMiLCJzcmMvbGFuZy9sb2NhbGUvemgtY24udHMiLCJzcmMvbGFuZy9sb2NhbGUvemgtdHcudHMiLCJzcmMvbGFuZy9oZWxwZXJzLnRzIiwic3JjL2Rvd25sb2FkLnRzIiwic3JjL3BheWxvYWRHZW5lcmF0b3IudHMiLCJzcmMvdXBsb2FkZXIvcGljZ28udHMiLCJzcmMvdXBsb2FkZXIvcGljZ29Db3JlLnRzIiwic3JjL3VwbG9hZGVyL2luZGV4LnRzIiwic3JjL2RlbGV0ZXIudHMiLCJzcmMvaGVscGVyLnRzIiwic3JjL3NldHRpbmcudHMiLCJzcmMvbWFpbi50cyJdLCJzb3VyY2VzQ29udGVudCI6WyIvLyAncGF0aCcgbW9kdWxlIGV4dHJhY3RlZCBmcm9tIE5vZGUuanMgdjguMTEuMSAob25seSB0aGUgcG9zaXggcGFydClcbi8vIHRyYW5zcGxpdGVkIHdpdGggQmFiZWxcblxuLy8gQ29weXJpZ2h0IEpveWVudCwgSW5jLiBhbmQgb3RoZXIgTm9kZSBjb250cmlidXRvcnMuXG4vL1xuLy8gUGVybWlzc2lvbiBpcyBoZXJlYnkgZ3JhbnRlZCwgZnJlZSBvZiBjaGFyZ2UsIHRvIGFueSBwZXJzb24gb2J0YWluaW5nIGFcbi8vIGNvcHkgb2YgdGhpcyBzb2Z0d2FyZSBhbmQgYXNzb2NpYXRlZCBkb2N1bWVudGF0aW9uIGZpbGVzICh0aGVcbi8vIFwiU29mdHdhcmVcIiksIHRvIGRlYWwgaW4gdGhlIFNvZnR3YXJlIHdpdGhvdXQgcmVzdHJpY3Rpb24sIGluY2x1ZGluZ1xuLy8gd2l0aG91dCBsaW1pdGF0aW9uIHRoZSByaWdodHMgdG8gdXNlLCBjb3B5LCBtb2RpZnksIG1lcmdlLCBwdWJsaXNoLFxuLy8gZGlzdHJpYnV0ZSwgc3VibGljZW5zZSwgYW5kL29yIHNlbGwgY29waWVzIG9mIHRoZSBTb2Z0d2FyZSwgYW5kIHRvIHBlcm1pdFxuLy8gcGVyc29ucyB0byB3aG9tIHRoZSBTb2Z0d2FyZSBpcyBmdXJuaXNoZWQgdG8gZG8gc28sIHN1YmplY3QgdG8gdGhlXG4vLyBmb2xsb3dpbmcgY29uZGl0aW9uczpcbi8vXG4vLyBUaGUgYWJvdmUgY29weXJpZ2h0IG5vdGljZSBhbmQgdGhpcyBwZXJtaXNzaW9uIG5vdGljZSBzaGFsbCBiZSBpbmNsdWRlZFxuLy8gaW4gYWxsIGNvcGllcyBvciBzdWJzdGFudGlhbCBwb3J0aW9ucyBvZiB0aGUgU29mdHdhcmUuXG4vL1xuLy8gVEhFIFNPRlRXQVJFIElTIFBST1ZJREVEIFwiQVMgSVNcIiwgV0lUSE9VVCBXQVJSQU5UWSBPRiBBTlkgS0lORCwgRVhQUkVTU1xuLy8gT1IgSU1QTElFRCwgSU5DTFVESU5HIEJVVCBOT1QgTElNSVRFRCBUTyBUSEUgV0FSUkFOVElFUyBPRlxuLy8gTUVSQ0hBTlRBQklMSVRZLCBGSVRORVNTIEZPUiBBIFBBUlRJQ1VMQVIgUFVSUE9TRSBBTkQgTk9OSU5GUklOR0VNRU5ULiBJTlxuLy8gTk8gRVZFTlQgU0hBTEwgVEhFIEFVVEhPUlMgT1IgQ09QWVJJR0hUIEhPTERFUlMgQkUgTElBQkxFIEZPUiBBTlkgQ0xBSU0sXG4vLyBEQU1BR0VTIE9SIE9USEVSIExJQUJJTElUWSwgV0hFVEhFUiBJTiBBTiBBQ1RJT04gT0YgQ09OVFJBQ1QsIFRPUlQgT1Jcbi8vIE9USEVSV0lTRSwgQVJJU0lORyBGUk9NLCBPVVQgT0YgT1IgSU4gQ09OTkVDVElPTiBXSVRIIFRIRSBTT0ZUV0FSRSBPUiBUSEVcbi8vIFVTRSBPUiBPVEhFUiBERUFMSU5HUyBJTiBUSEUgU09GVFdBUkUuXG5cbid1c2Ugc3RyaWN0JztcblxuZnVuY3Rpb24gYXNzZXJ0UGF0aChwYXRoKSB7XG4gIGlmICh0eXBlb2YgcGF0aCAhPT0gJ3N0cmluZycpIHtcbiAgICB0aHJvdyBuZXcgVHlwZUVycm9yKCdQYXRoIG11c3QgYmUgYSBzdHJpbmcuIFJlY2VpdmVkICcgKyBKU09OLnN0cmluZ2lmeShwYXRoKSk7XG4gIH1cbn1cblxuLy8gUmVzb2x2ZXMgLiBhbmQgLi4gZWxlbWVudHMgaW4gYSBwYXRoIHdpdGggZGlyZWN0b3J5IG5hbWVzXG5mdW5jdGlvbiBub3JtYWxpemVTdHJpbmdQb3NpeChwYXRoLCBhbGxvd0Fib3ZlUm9vdCkge1xuICB2YXIgcmVzID0gJyc7XG4gIHZhciBsYXN0U2VnbWVudExlbmd0aCA9IDA7XG4gIHZhciBsYXN0U2xhc2ggPSAtMTtcbiAgdmFyIGRvdHMgPSAwO1xuICB2YXIgY29kZTtcbiAgZm9yICh2YXIgaSA9IDA7IGkgPD0gcGF0aC5sZW5ndGg7ICsraSkge1xuICAgIGlmIChpIDwgcGF0aC5sZW5ndGgpXG4gICAgICBjb2RlID0gcGF0aC5jaGFyQ29kZUF0KGkpO1xuICAgIGVsc2UgaWYgKGNvZGUgPT09IDQ3IC8qLyovKVxuICAgICAgYnJlYWs7XG4gICAgZWxzZVxuICAgICAgY29kZSA9IDQ3IC8qLyovO1xuICAgIGlmIChjb2RlID09PSA0NyAvKi8qLykge1xuICAgICAgaWYgKGxhc3RTbGFzaCA9PT0gaSAtIDEgfHwgZG90cyA9PT0gMSkge1xuICAgICAgICAvLyBOT09QXG4gICAgICB9IGVsc2UgaWYgKGxhc3RTbGFzaCAhPT0gaSAtIDEgJiYgZG90cyA9PT0gMikge1xuICAgICAgICBpZiAocmVzLmxlbmd0aCA8IDIgfHwgbGFzdFNlZ21lbnRMZW5ndGggIT09IDIgfHwgcmVzLmNoYXJDb2RlQXQocmVzLmxlbmd0aCAtIDEpICE9PSA0NiAvKi4qLyB8fCByZXMuY2hhckNvZGVBdChyZXMubGVuZ3RoIC0gMikgIT09IDQ2IC8qLiovKSB7XG4gICAgICAgICAgaWYgKHJlcy5sZW5ndGggPiAyKSB7XG4gICAgICAgICAgICB2YXIgbGFzdFNsYXNoSW5kZXggPSByZXMubGFzdEluZGV4T2YoJy8nKTtcbiAgICAgICAgICAgIGlmIChsYXN0U2xhc2hJbmRleCAhPT0gcmVzLmxlbmd0aCAtIDEpIHtcbiAgICAgICAgICAgICAgaWYgKGxhc3RTbGFzaEluZGV4ID09PSAtMSkge1xuICAgICAgICAgICAgICAgIHJlcyA9ICcnO1xuICAgICAgICAgICAgICAgIGxhc3RTZWdtZW50TGVuZ3RoID0gMDtcbiAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICByZXMgPSByZXMuc2xpY2UoMCwgbGFzdFNsYXNoSW5kZXgpO1xuICAgICAgICAgICAgICAgIGxhc3RTZWdtZW50TGVuZ3RoID0gcmVzLmxlbmd0aCAtIDEgLSByZXMubGFzdEluZGV4T2YoJy8nKTtcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICBsYXN0U2xhc2ggPSBpO1xuICAgICAgICAgICAgICBkb3RzID0gMDtcbiAgICAgICAgICAgICAgY29udGludWU7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfSBlbHNlIGlmIChyZXMubGVuZ3RoID09PSAyIHx8IHJlcy5sZW5ndGggPT09IDEpIHtcbiAgICAgICAgICAgIHJlcyA9ICcnO1xuICAgICAgICAgICAgbGFzdFNlZ21lbnRMZW5ndGggPSAwO1xuICAgICAgICAgICAgbGFzdFNsYXNoID0gaTtcbiAgICAgICAgICAgIGRvdHMgPSAwO1xuICAgICAgICAgICAgY29udGludWU7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIGlmIChhbGxvd0Fib3ZlUm9vdCkge1xuICAgICAgICAgIGlmIChyZXMubGVuZ3RoID4gMClcbiAgICAgICAgICAgIHJlcyArPSAnLy4uJztcbiAgICAgICAgICBlbHNlXG4gICAgICAgICAgICByZXMgPSAnLi4nO1xuICAgICAgICAgIGxhc3RTZWdtZW50TGVuZ3RoID0gMjtcbiAgICAgICAgfVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgaWYgKHJlcy5sZW5ndGggPiAwKVxuICAgICAgICAgIHJlcyArPSAnLycgKyBwYXRoLnNsaWNlKGxhc3RTbGFzaCArIDEsIGkpO1xuICAgICAgICBlbHNlXG4gICAgICAgICAgcmVzID0gcGF0aC5zbGljZShsYXN0U2xhc2ggKyAxLCBpKTtcbiAgICAgICAgbGFzdFNlZ21lbnRMZW5ndGggPSBpIC0gbGFzdFNsYXNoIC0gMTtcbiAgICAgIH1cbiAgICAgIGxhc3RTbGFzaCA9IGk7XG4gICAgICBkb3RzID0gMDtcbiAgICB9IGVsc2UgaWYgKGNvZGUgPT09IDQ2IC8qLiovICYmIGRvdHMgIT09IC0xKSB7XG4gICAgICArK2RvdHM7XG4gICAgfSBlbHNlIHtcbiAgICAgIGRvdHMgPSAtMTtcbiAgICB9XG4gIH1cbiAgcmV0dXJuIHJlcztcbn1cblxuZnVuY3Rpb24gX2Zvcm1hdChzZXAsIHBhdGhPYmplY3QpIHtcbiAgdmFyIGRpciA9IHBhdGhPYmplY3QuZGlyIHx8IHBhdGhPYmplY3Qucm9vdDtcbiAgdmFyIGJhc2UgPSBwYXRoT2JqZWN0LmJhc2UgfHwgKHBhdGhPYmplY3QubmFtZSB8fCAnJykgKyAocGF0aE9iamVjdC5leHQgfHwgJycpO1xuICBpZiAoIWRpcikge1xuICAgIHJldHVybiBiYXNlO1xuICB9XG4gIGlmIChkaXIgPT09IHBhdGhPYmplY3Qucm9vdCkge1xuICAgIHJldHVybiBkaXIgKyBiYXNlO1xuICB9XG4gIHJldHVybiBkaXIgKyBzZXAgKyBiYXNlO1xufVxuXG52YXIgcG9zaXggPSB7XG4gIC8vIHBhdGgucmVzb2x2ZShbZnJvbSAuLi5dLCB0bylcbiAgcmVzb2x2ZTogZnVuY3Rpb24gcmVzb2x2ZSgpIHtcbiAgICB2YXIgcmVzb2x2ZWRQYXRoID0gJyc7XG4gICAgdmFyIHJlc29sdmVkQWJzb2x1dGUgPSBmYWxzZTtcbiAgICB2YXIgY3dkO1xuXG4gICAgZm9yICh2YXIgaSA9IGFyZ3VtZW50cy5sZW5ndGggLSAxOyBpID49IC0xICYmICFyZXNvbHZlZEFic29sdXRlOyBpLS0pIHtcbiAgICAgIHZhciBwYXRoO1xuICAgICAgaWYgKGkgPj0gMClcbiAgICAgICAgcGF0aCA9IGFyZ3VtZW50c1tpXTtcbiAgICAgIGVsc2Uge1xuICAgICAgICBpZiAoY3dkID09PSB1bmRlZmluZWQpXG4gICAgICAgICAgY3dkID0gcHJvY2Vzcy5jd2QoKTtcbiAgICAgICAgcGF0aCA9IGN3ZDtcbiAgICAgIH1cblxuICAgICAgYXNzZXJ0UGF0aChwYXRoKTtcblxuICAgICAgLy8gU2tpcCBlbXB0eSBlbnRyaWVzXG4gICAgICBpZiAocGF0aC5sZW5ndGggPT09IDApIHtcbiAgICAgICAgY29udGludWU7XG4gICAgICB9XG5cbiAgICAgIHJlc29sdmVkUGF0aCA9IHBhdGggKyAnLycgKyByZXNvbHZlZFBhdGg7XG4gICAgICByZXNvbHZlZEFic29sdXRlID0gcGF0aC5jaGFyQ29kZUF0KDApID09PSA0NyAvKi8qLztcbiAgICB9XG5cbiAgICAvLyBBdCB0aGlzIHBvaW50IHRoZSBwYXRoIHNob3VsZCBiZSByZXNvbHZlZCB0byBhIGZ1bGwgYWJzb2x1dGUgcGF0aCwgYnV0XG4gICAgLy8gaGFuZGxlIHJlbGF0aXZlIHBhdGhzIHRvIGJlIHNhZmUgKG1pZ2h0IGhhcHBlbiB3aGVuIHByb2Nlc3MuY3dkKCkgZmFpbHMpXG5cbiAgICAvLyBOb3JtYWxpemUgdGhlIHBhdGhcbiAgICByZXNvbHZlZFBhdGggPSBub3JtYWxpemVTdHJpbmdQb3NpeChyZXNvbHZlZFBhdGgsICFyZXNvbHZlZEFic29sdXRlKTtcblxuICAgIGlmIChyZXNvbHZlZEFic29sdXRlKSB7XG4gICAgICBpZiAocmVzb2x2ZWRQYXRoLmxlbmd0aCA+IDApXG4gICAgICAgIHJldHVybiAnLycgKyByZXNvbHZlZFBhdGg7XG4gICAgICBlbHNlXG4gICAgICAgIHJldHVybiAnLyc7XG4gICAgfSBlbHNlIGlmIChyZXNvbHZlZFBhdGgubGVuZ3RoID4gMCkge1xuICAgICAgcmV0dXJuIHJlc29sdmVkUGF0aDtcbiAgICB9IGVsc2Uge1xuICAgICAgcmV0dXJuICcuJztcbiAgICB9XG4gIH0sXG5cbiAgbm9ybWFsaXplOiBmdW5jdGlvbiBub3JtYWxpemUocGF0aCkge1xuICAgIGFzc2VydFBhdGgocGF0aCk7XG5cbiAgICBpZiAocGF0aC5sZW5ndGggPT09IDApIHJldHVybiAnLic7XG5cbiAgICB2YXIgaXNBYnNvbHV0ZSA9IHBhdGguY2hhckNvZGVBdCgwKSA9PT0gNDcgLyovKi87XG4gICAgdmFyIHRyYWlsaW5nU2VwYXJhdG9yID0gcGF0aC5jaGFyQ29kZUF0KHBhdGgubGVuZ3RoIC0gMSkgPT09IDQ3IC8qLyovO1xuXG4gICAgLy8gTm9ybWFsaXplIHRoZSBwYXRoXG4gICAgcGF0aCA9IG5vcm1hbGl6ZVN0cmluZ1Bvc2l4KHBhdGgsICFpc0Fic29sdXRlKTtcblxuICAgIGlmIChwYXRoLmxlbmd0aCA9PT0gMCAmJiAhaXNBYnNvbHV0ZSkgcGF0aCA9ICcuJztcbiAgICBpZiAocGF0aC5sZW5ndGggPiAwICYmIHRyYWlsaW5nU2VwYXJhdG9yKSBwYXRoICs9ICcvJztcblxuICAgIGlmIChpc0Fic29sdXRlKSByZXR1cm4gJy8nICsgcGF0aDtcbiAgICByZXR1cm4gcGF0aDtcbiAgfSxcblxuICBpc0Fic29sdXRlOiBmdW5jdGlvbiBpc0Fic29sdXRlKHBhdGgpIHtcbiAgICBhc3NlcnRQYXRoKHBhdGgpO1xuICAgIHJldHVybiBwYXRoLmxlbmd0aCA+IDAgJiYgcGF0aC5jaGFyQ29kZUF0KDApID09PSA0NyAvKi8qLztcbiAgfSxcblxuICBqb2luOiBmdW5jdGlvbiBqb2luKCkge1xuICAgIGlmIChhcmd1bWVudHMubGVuZ3RoID09PSAwKVxuICAgICAgcmV0dXJuICcuJztcbiAgICB2YXIgam9pbmVkO1xuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgYXJndW1lbnRzLmxlbmd0aDsgKytpKSB7XG4gICAgICB2YXIgYXJnID0gYXJndW1lbnRzW2ldO1xuICAgICAgYXNzZXJ0UGF0aChhcmcpO1xuICAgICAgaWYgKGFyZy5sZW5ndGggPiAwKSB7XG4gICAgICAgIGlmIChqb2luZWQgPT09IHVuZGVmaW5lZClcbiAgICAgICAgICBqb2luZWQgPSBhcmc7XG4gICAgICAgIGVsc2VcbiAgICAgICAgICBqb2luZWQgKz0gJy8nICsgYXJnO1xuICAgICAgfVxuICAgIH1cbiAgICBpZiAoam9pbmVkID09PSB1bmRlZmluZWQpXG4gICAgICByZXR1cm4gJy4nO1xuICAgIHJldHVybiBwb3NpeC5ub3JtYWxpemUoam9pbmVkKTtcbiAgfSxcblxuICByZWxhdGl2ZTogZnVuY3Rpb24gcmVsYXRpdmUoZnJvbSwgdG8pIHtcbiAgICBhc3NlcnRQYXRoKGZyb20pO1xuICAgIGFzc2VydFBhdGgodG8pO1xuXG4gICAgaWYgKGZyb20gPT09IHRvKSByZXR1cm4gJyc7XG5cbiAgICBmcm9tID0gcG9zaXgucmVzb2x2ZShmcm9tKTtcbiAgICB0byA9IHBvc2l4LnJlc29sdmUodG8pO1xuXG4gICAgaWYgKGZyb20gPT09IHRvKSByZXR1cm4gJyc7XG5cbiAgICAvLyBUcmltIGFueSBsZWFkaW5nIGJhY2tzbGFzaGVzXG4gICAgdmFyIGZyb21TdGFydCA9IDE7XG4gICAgZm9yICg7IGZyb21TdGFydCA8IGZyb20ubGVuZ3RoOyArK2Zyb21TdGFydCkge1xuICAgICAgaWYgKGZyb20uY2hhckNvZGVBdChmcm9tU3RhcnQpICE9PSA0NyAvKi8qLylcbiAgICAgICAgYnJlYWs7XG4gICAgfVxuICAgIHZhciBmcm9tRW5kID0gZnJvbS5sZW5ndGg7XG4gICAgdmFyIGZyb21MZW4gPSBmcm9tRW5kIC0gZnJvbVN0YXJ0O1xuXG4gICAgLy8gVHJpbSBhbnkgbGVhZGluZyBiYWNrc2xhc2hlc1xuICAgIHZhciB0b1N0YXJ0ID0gMTtcbiAgICBmb3IgKDsgdG9TdGFydCA8IHRvLmxlbmd0aDsgKyt0b1N0YXJ0KSB7XG4gICAgICBpZiAodG8uY2hhckNvZGVBdCh0b1N0YXJ0KSAhPT0gNDcgLyovKi8pXG4gICAgICAgIGJyZWFrO1xuICAgIH1cbiAgICB2YXIgdG9FbmQgPSB0by5sZW5ndGg7XG4gICAgdmFyIHRvTGVuID0gdG9FbmQgLSB0b1N0YXJ0O1xuXG4gICAgLy8gQ29tcGFyZSBwYXRocyB0byBmaW5kIHRoZSBsb25nZXN0IGNvbW1vbiBwYXRoIGZyb20gcm9vdFxuICAgIHZhciBsZW5ndGggPSBmcm9tTGVuIDwgdG9MZW4gPyBmcm9tTGVuIDogdG9MZW47XG4gICAgdmFyIGxhc3RDb21tb25TZXAgPSAtMTtcbiAgICB2YXIgaSA9IDA7XG4gICAgZm9yICg7IGkgPD0gbGVuZ3RoOyArK2kpIHtcbiAgICAgIGlmIChpID09PSBsZW5ndGgpIHtcbiAgICAgICAgaWYgKHRvTGVuID4gbGVuZ3RoKSB7XG4gICAgICAgICAgaWYgKHRvLmNoYXJDb2RlQXQodG9TdGFydCArIGkpID09PSA0NyAvKi8qLykge1xuICAgICAgICAgICAgLy8gV2UgZ2V0IGhlcmUgaWYgYGZyb21gIGlzIHRoZSBleGFjdCBiYXNlIHBhdGggZm9yIGB0b2AuXG4gICAgICAgICAgICAvLyBGb3IgZXhhbXBsZTogZnJvbT0nL2Zvby9iYXInOyB0bz0nL2Zvby9iYXIvYmF6J1xuICAgICAgICAgICAgcmV0dXJuIHRvLnNsaWNlKHRvU3RhcnQgKyBpICsgMSk7XG4gICAgICAgICAgfSBlbHNlIGlmIChpID09PSAwKSB7XG4gICAgICAgICAgICAvLyBXZSBnZXQgaGVyZSBpZiBgZnJvbWAgaXMgdGhlIHJvb3RcbiAgICAgICAgICAgIC8vIEZvciBleGFtcGxlOiBmcm9tPScvJzsgdG89Jy9mb28nXG4gICAgICAgICAgICByZXR1cm4gdG8uc2xpY2UodG9TdGFydCArIGkpO1xuICAgICAgICAgIH1cbiAgICAgICAgfSBlbHNlIGlmIChmcm9tTGVuID4gbGVuZ3RoKSB7XG4gICAgICAgICAgaWYgKGZyb20uY2hhckNvZGVBdChmcm9tU3RhcnQgKyBpKSA9PT0gNDcgLyovKi8pIHtcbiAgICAgICAgICAgIC8vIFdlIGdldCBoZXJlIGlmIGB0b2AgaXMgdGhlIGV4YWN0IGJhc2UgcGF0aCBmb3IgYGZyb21gLlxuICAgICAgICAgICAgLy8gRm9yIGV4YW1wbGU6IGZyb209Jy9mb28vYmFyL2Jheic7IHRvPScvZm9vL2JhcidcbiAgICAgICAgICAgIGxhc3RDb21tb25TZXAgPSBpO1xuICAgICAgICAgIH0gZWxzZSBpZiAoaSA9PT0gMCkge1xuICAgICAgICAgICAgLy8gV2UgZ2V0IGhlcmUgaWYgYHRvYCBpcyB0aGUgcm9vdC5cbiAgICAgICAgICAgIC8vIEZvciBleGFtcGxlOiBmcm9tPScvZm9vJzsgdG89Jy8nXG4gICAgICAgICAgICBsYXN0Q29tbW9uU2VwID0gMDtcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgYnJlYWs7XG4gICAgICB9XG4gICAgICB2YXIgZnJvbUNvZGUgPSBmcm9tLmNoYXJDb2RlQXQoZnJvbVN0YXJ0ICsgaSk7XG4gICAgICB2YXIgdG9Db2RlID0gdG8uY2hhckNvZGVBdCh0b1N0YXJ0ICsgaSk7XG4gICAgICBpZiAoZnJvbUNvZGUgIT09IHRvQ29kZSlcbiAgICAgICAgYnJlYWs7XG4gICAgICBlbHNlIGlmIChmcm9tQ29kZSA9PT0gNDcgLyovKi8pXG4gICAgICAgIGxhc3RDb21tb25TZXAgPSBpO1xuICAgIH1cblxuICAgIHZhciBvdXQgPSAnJztcbiAgICAvLyBHZW5lcmF0ZSB0aGUgcmVsYXRpdmUgcGF0aCBiYXNlZCBvbiB0aGUgcGF0aCBkaWZmZXJlbmNlIGJldHdlZW4gYHRvYFxuICAgIC8vIGFuZCBgZnJvbWBcbiAgICBmb3IgKGkgPSBmcm9tU3RhcnQgKyBsYXN0Q29tbW9uU2VwICsgMTsgaSA8PSBmcm9tRW5kOyArK2kpIHtcbiAgICAgIGlmIChpID09PSBmcm9tRW5kIHx8IGZyb20uY2hhckNvZGVBdChpKSA9PT0gNDcgLyovKi8pIHtcbiAgICAgICAgaWYgKG91dC5sZW5ndGggPT09IDApXG4gICAgICAgICAgb3V0ICs9ICcuLic7XG4gICAgICAgIGVsc2VcbiAgICAgICAgICBvdXQgKz0gJy8uLic7XG4gICAgICB9XG4gICAgfVxuXG4gICAgLy8gTGFzdGx5LCBhcHBlbmQgdGhlIHJlc3Qgb2YgdGhlIGRlc3RpbmF0aW9uIChgdG9gKSBwYXRoIHRoYXQgY29tZXMgYWZ0ZXJcbiAgICAvLyB0aGUgY29tbW9uIHBhdGggcGFydHNcbiAgICBpZiAob3V0Lmxlbmd0aCA+IDApXG4gICAgICByZXR1cm4gb3V0ICsgdG8uc2xpY2UodG9TdGFydCArIGxhc3RDb21tb25TZXApO1xuICAgIGVsc2Uge1xuICAgICAgdG9TdGFydCArPSBsYXN0Q29tbW9uU2VwO1xuICAgICAgaWYgKHRvLmNoYXJDb2RlQXQodG9TdGFydCkgPT09IDQ3IC8qLyovKVxuICAgICAgICArK3RvU3RhcnQ7XG4gICAgICByZXR1cm4gdG8uc2xpY2UodG9TdGFydCk7XG4gICAgfVxuICB9LFxuXG4gIF9tYWtlTG9uZzogZnVuY3Rpb24gX21ha2VMb25nKHBhdGgpIHtcbiAgICByZXR1cm4gcGF0aDtcbiAgfSxcblxuICBkaXJuYW1lOiBmdW5jdGlvbiBkaXJuYW1lKHBhdGgpIHtcbiAgICBhc3NlcnRQYXRoKHBhdGgpO1xuICAgIGlmIChwYXRoLmxlbmd0aCA9PT0gMCkgcmV0dXJuICcuJztcbiAgICB2YXIgY29kZSA9IHBhdGguY2hhckNvZGVBdCgwKTtcbiAgICB2YXIgaGFzUm9vdCA9IGNvZGUgPT09IDQ3IC8qLyovO1xuICAgIHZhciBlbmQgPSAtMTtcbiAgICB2YXIgbWF0Y2hlZFNsYXNoID0gdHJ1ZTtcbiAgICBmb3IgKHZhciBpID0gcGF0aC5sZW5ndGggLSAxOyBpID49IDE7IC0taSkge1xuICAgICAgY29kZSA9IHBhdGguY2hhckNvZGVBdChpKTtcbiAgICAgIGlmIChjb2RlID09PSA0NyAvKi8qLykge1xuICAgICAgICAgIGlmICghbWF0Y2hlZFNsYXNoKSB7XG4gICAgICAgICAgICBlbmQgPSBpO1xuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgfVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAvLyBXZSBzYXcgdGhlIGZpcnN0IG5vbi1wYXRoIHNlcGFyYXRvclxuICAgICAgICBtYXRjaGVkU2xhc2ggPSBmYWxzZTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICBpZiAoZW5kID09PSAtMSkgcmV0dXJuIGhhc1Jvb3QgPyAnLycgOiAnLic7XG4gICAgaWYgKGhhc1Jvb3QgJiYgZW5kID09PSAxKSByZXR1cm4gJy8vJztcbiAgICByZXR1cm4gcGF0aC5zbGljZSgwLCBlbmQpO1xuICB9LFxuXG4gIGJhc2VuYW1lOiBmdW5jdGlvbiBiYXNlbmFtZShwYXRoLCBleHQpIHtcbiAgICBpZiAoZXh0ICE9PSB1bmRlZmluZWQgJiYgdHlwZW9mIGV4dCAhPT0gJ3N0cmluZycpIHRocm93IG5ldyBUeXBlRXJyb3IoJ1wiZXh0XCIgYXJndW1lbnQgbXVzdCBiZSBhIHN0cmluZycpO1xuICAgIGFzc2VydFBhdGgocGF0aCk7XG5cbiAgICB2YXIgc3RhcnQgPSAwO1xuICAgIHZhciBlbmQgPSAtMTtcbiAgICB2YXIgbWF0Y2hlZFNsYXNoID0gdHJ1ZTtcbiAgICB2YXIgaTtcblxuICAgIGlmIChleHQgIT09IHVuZGVmaW5lZCAmJiBleHQubGVuZ3RoID4gMCAmJiBleHQubGVuZ3RoIDw9IHBhdGgubGVuZ3RoKSB7XG4gICAgICBpZiAoZXh0Lmxlbmd0aCA9PT0gcGF0aC5sZW5ndGggJiYgZXh0ID09PSBwYXRoKSByZXR1cm4gJyc7XG4gICAgICB2YXIgZXh0SWR4ID0gZXh0Lmxlbmd0aCAtIDE7XG4gICAgICB2YXIgZmlyc3ROb25TbGFzaEVuZCA9IC0xO1xuICAgICAgZm9yIChpID0gcGF0aC5sZW5ndGggLSAxOyBpID49IDA7IC0taSkge1xuICAgICAgICB2YXIgY29kZSA9IHBhdGguY2hhckNvZGVBdChpKTtcbiAgICAgICAgaWYgKGNvZGUgPT09IDQ3IC8qLyovKSB7XG4gICAgICAgICAgICAvLyBJZiB3ZSByZWFjaGVkIGEgcGF0aCBzZXBhcmF0b3IgdGhhdCB3YXMgbm90IHBhcnQgb2YgYSBzZXQgb2YgcGF0aFxuICAgICAgICAgICAgLy8gc2VwYXJhdG9ycyBhdCB0aGUgZW5kIG9mIHRoZSBzdHJpbmcsIHN0b3Agbm93XG4gICAgICAgICAgICBpZiAoIW1hdGNoZWRTbGFzaCkge1xuICAgICAgICAgICAgICBzdGFydCA9IGkgKyAxO1xuICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIGlmIChmaXJzdE5vblNsYXNoRW5kID09PSAtMSkge1xuICAgICAgICAgICAgLy8gV2Ugc2F3IHRoZSBmaXJzdCBub24tcGF0aCBzZXBhcmF0b3IsIHJlbWVtYmVyIHRoaXMgaW5kZXggaW4gY2FzZVxuICAgICAgICAgICAgLy8gd2UgbmVlZCBpdCBpZiB0aGUgZXh0ZW5zaW9uIGVuZHMgdXAgbm90IG1hdGNoaW5nXG4gICAgICAgICAgICBtYXRjaGVkU2xhc2ggPSBmYWxzZTtcbiAgICAgICAgICAgIGZpcnN0Tm9uU2xhc2hFbmQgPSBpICsgMTtcbiAgICAgICAgICB9XG4gICAgICAgICAgaWYgKGV4dElkeCA+PSAwKSB7XG4gICAgICAgICAgICAvLyBUcnkgdG8gbWF0Y2ggdGhlIGV4cGxpY2l0IGV4dGVuc2lvblxuICAgICAgICAgICAgaWYgKGNvZGUgPT09IGV4dC5jaGFyQ29kZUF0KGV4dElkeCkpIHtcbiAgICAgICAgICAgICAgaWYgKC0tZXh0SWR4ID09PSAtMSkge1xuICAgICAgICAgICAgICAgIC8vIFdlIG1hdGNoZWQgdGhlIGV4dGVuc2lvbiwgc28gbWFyayB0aGlzIGFzIHRoZSBlbmQgb2Ygb3VyIHBhdGhcbiAgICAgICAgICAgICAgICAvLyBjb21wb25lbnRcbiAgICAgICAgICAgICAgICBlbmQgPSBpO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAvLyBFeHRlbnNpb24gZG9lcyBub3QgbWF0Y2gsIHNvIG91ciByZXN1bHQgaXMgdGhlIGVudGlyZSBwYXRoXG4gICAgICAgICAgICAgIC8vIGNvbXBvbmVudFxuICAgICAgICAgICAgICBleHRJZHggPSAtMTtcbiAgICAgICAgICAgICAgZW5kID0gZmlyc3ROb25TbGFzaEVuZDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgaWYgKHN0YXJ0ID09PSBlbmQpIGVuZCA9IGZpcnN0Tm9uU2xhc2hFbmQ7ZWxzZSBpZiAoZW5kID09PSAtMSkgZW5kID0gcGF0aC5sZW5ndGg7XG4gICAgICByZXR1cm4gcGF0aC5zbGljZShzdGFydCwgZW5kKTtcbiAgICB9IGVsc2Uge1xuICAgICAgZm9yIChpID0gcGF0aC5sZW5ndGggLSAxOyBpID49IDA7IC0taSkge1xuICAgICAgICBpZiAocGF0aC5jaGFyQ29kZUF0KGkpID09PSA0NyAvKi8qLykge1xuICAgICAgICAgICAgLy8gSWYgd2UgcmVhY2hlZCBhIHBhdGggc2VwYXJhdG9yIHRoYXQgd2FzIG5vdCBwYXJ0IG9mIGEgc2V0IG9mIHBhdGhcbiAgICAgICAgICAgIC8vIHNlcGFyYXRvcnMgYXQgdGhlIGVuZCBvZiB0aGUgc3RyaW5nLCBzdG9wIG5vd1xuICAgICAgICAgICAgaWYgKCFtYXRjaGVkU2xhc2gpIHtcbiAgICAgICAgICAgICAgc3RhcnQgPSBpICsgMTtcbiAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfSBlbHNlIGlmIChlbmQgPT09IC0xKSB7XG4gICAgICAgICAgLy8gV2Ugc2F3IHRoZSBmaXJzdCBub24tcGF0aCBzZXBhcmF0b3IsIG1hcmsgdGhpcyBhcyB0aGUgZW5kIG9mIG91clxuICAgICAgICAgIC8vIHBhdGggY29tcG9uZW50XG4gICAgICAgICAgbWF0Y2hlZFNsYXNoID0gZmFsc2U7XG4gICAgICAgICAgZW5kID0gaSArIDE7XG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgaWYgKGVuZCA9PT0gLTEpIHJldHVybiAnJztcbiAgICAgIHJldHVybiBwYXRoLnNsaWNlKHN0YXJ0LCBlbmQpO1xuICAgIH1cbiAgfSxcblxuICBleHRuYW1lOiBmdW5jdGlvbiBleHRuYW1lKHBhdGgpIHtcbiAgICBhc3NlcnRQYXRoKHBhdGgpO1xuICAgIHZhciBzdGFydERvdCA9IC0xO1xuICAgIHZhciBzdGFydFBhcnQgPSAwO1xuICAgIHZhciBlbmQgPSAtMTtcbiAgICB2YXIgbWF0Y2hlZFNsYXNoID0gdHJ1ZTtcbiAgICAvLyBUcmFjayB0aGUgc3RhdGUgb2YgY2hhcmFjdGVycyAoaWYgYW55KSB3ZSBzZWUgYmVmb3JlIG91ciBmaXJzdCBkb3QgYW5kXG4gICAgLy8gYWZ0ZXIgYW55IHBhdGggc2VwYXJhdG9yIHdlIGZpbmRcbiAgICB2YXIgcHJlRG90U3RhdGUgPSAwO1xuICAgIGZvciAodmFyIGkgPSBwYXRoLmxlbmd0aCAtIDE7IGkgPj0gMDsgLS1pKSB7XG4gICAgICB2YXIgY29kZSA9IHBhdGguY2hhckNvZGVBdChpKTtcbiAgICAgIGlmIChjb2RlID09PSA0NyAvKi8qLykge1xuICAgICAgICAgIC8vIElmIHdlIHJlYWNoZWQgYSBwYXRoIHNlcGFyYXRvciB0aGF0IHdhcyBub3QgcGFydCBvZiBhIHNldCBvZiBwYXRoXG4gICAgICAgICAgLy8gc2VwYXJhdG9ycyBhdCB0aGUgZW5kIG9mIHRoZSBzdHJpbmcsIHN0b3Agbm93XG4gICAgICAgICAgaWYgKCFtYXRjaGVkU2xhc2gpIHtcbiAgICAgICAgICAgIHN0YXJ0UGFydCA9IGkgKyAxO1xuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgfVxuICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICB9XG4gICAgICBpZiAoZW5kID09PSAtMSkge1xuICAgICAgICAvLyBXZSBzYXcgdGhlIGZpcnN0IG5vbi1wYXRoIHNlcGFyYXRvciwgbWFyayB0aGlzIGFzIHRoZSBlbmQgb2Ygb3VyXG4gICAgICAgIC8vIGV4dGVuc2lvblxuICAgICAgICBtYXRjaGVkU2xhc2ggPSBmYWxzZTtcbiAgICAgICAgZW5kID0gaSArIDE7XG4gICAgICB9XG4gICAgICBpZiAoY29kZSA9PT0gNDYgLyouKi8pIHtcbiAgICAgICAgICAvLyBJZiB0aGlzIGlzIG91ciBmaXJzdCBkb3QsIG1hcmsgaXQgYXMgdGhlIHN0YXJ0IG9mIG91ciBleHRlbnNpb25cbiAgICAgICAgICBpZiAoc3RhcnREb3QgPT09IC0xKVxuICAgICAgICAgICAgc3RhcnREb3QgPSBpO1xuICAgICAgICAgIGVsc2UgaWYgKHByZURvdFN0YXRlICE9PSAxKVxuICAgICAgICAgICAgcHJlRG90U3RhdGUgPSAxO1xuICAgICAgfSBlbHNlIGlmIChzdGFydERvdCAhPT0gLTEpIHtcbiAgICAgICAgLy8gV2Ugc2F3IGEgbm9uLWRvdCBhbmQgbm9uLXBhdGggc2VwYXJhdG9yIGJlZm9yZSBvdXIgZG90LCBzbyB3ZSBzaG91bGRcbiAgICAgICAgLy8gaGF2ZSBhIGdvb2QgY2hhbmNlIGF0IGhhdmluZyBhIG5vbi1lbXB0eSBleHRlbnNpb25cbiAgICAgICAgcHJlRG90U3RhdGUgPSAtMTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICBpZiAoc3RhcnREb3QgPT09IC0xIHx8IGVuZCA9PT0gLTEgfHxcbiAgICAgICAgLy8gV2Ugc2F3IGEgbm9uLWRvdCBjaGFyYWN0ZXIgaW1tZWRpYXRlbHkgYmVmb3JlIHRoZSBkb3RcbiAgICAgICAgcHJlRG90U3RhdGUgPT09IDAgfHxcbiAgICAgICAgLy8gVGhlIChyaWdodC1tb3N0KSB0cmltbWVkIHBhdGggY29tcG9uZW50IGlzIGV4YWN0bHkgJy4uJ1xuICAgICAgICBwcmVEb3RTdGF0ZSA9PT0gMSAmJiBzdGFydERvdCA9PT0gZW5kIC0gMSAmJiBzdGFydERvdCA9PT0gc3RhcnRQYXJ0ICsgMSkge1xuICAgICAgcmV0dXJuICcnO1xuICAgIH1cbiAgICByZXR1cm4gcGF0aC5zbGljZShzdGFydERvdCwgZW5kKTtcbiAgfSxcblxuICBmb3JtYXQ6IGZ1bmN0aW9uIGZvcm1hdChwYXRoT2JqZWN0KSB7XG4gICAgaWYgKHBhdGhPYmplY3QgPT09IG51bGwgfHwgdHlwZW9mIHBhdGhPYmplY3QgIT09ICdvYmplY3QnKSB7XG4gICAgICB0aHJvdyBuZXcgVHlwZUVycm9yKCdUaGUgXCJwYXRoT2JqZWN0XCIgYXJndW1lbnQgbXVzdCBiZSBvZiB0eXBlIE9iamVjdC4gUmVjZWl2ZWQgdHlwZSAnICsgdHlwZW9mIHBhdGhPYmplY3QpO1xuICAgIH1cbiAgICByZXR1cm4gX2Zvcm1hdCgnLycsIHBhdGhPYmplY3QpO1xuICB9LFxuXG4gIHBhcnNlOiBmdW5jdGlvbiBwYXJzZShwYXRoKSB7XG4gICAgYXNzZXJ0UGF0aChwYXRoKTtcblxuICAgIHZhciByZXQgPSB7IHJvb3Q6ICcnLCBkaXI6ICcnLCBiYXNlOiAnJywgZXh0OiAnJywgbmFtZTogJycgfTtcbiAgICBpZiAocGF0aC5sZW5ndGggPT09IDApIHJldHVybiByZXQ7XG4gICAgdmFyIGNvZGUgPSBwYXRoLmNoYXJDb2RlQXQoMCk7XG4gICAgdmFyIGlzQWJzb2x1dGUgPSBjb2RlID09PSA0NyAvKi8qLztcbiAgICB2YXIgc3RhcnQ7XG4gICAgaWYgKGlzQWJzb2x1dGUpIHtcbiAgICAgIHJldC5yb290ID0gJy8nO1xuICAgICAgc3RhcnQgPSAxO1xuICAgIH0gZWxzZSB7XG4gICAgICBzdGFydCA9IDA7XG4gICAgfVxuICAgIHZhciBzdGFydERvdCA9IC0xO1xuICAgIHZhciBzdGFydFBhcnQgPSAwO1xuICAgIHZhciBlbmQgPSAtMTtcbiAgICB2YXIgbWF0Y2hlZFNsYXNoID0gdHJ1ZTtcbiAgICB2YXIgaSA9IHBhdGgubGVuZ3RoIC0gMTtcblxuICAgIC8vIFRyYWNrIHRoZSBzdGF0ZSBvZiBjaGFyYWN0ZXJzIChpZiBhbnkpIHdlIHNlZSBiZWZvcmUgb3VyIGZpcnN0IGRvdCBhbmRcbiAgICAvLyBhZnRlciBhbnkgcGF0aCBzZXBhcmF0b3Igd2UgZmluZFxuICAgIHZhciBwcmVEb3RTdGF0ZSA9IDA7XG5cbiAgICAvLyBHZXQgbm9uLWRpciBpbmZvXG4gICAgZm9yICg7IGkgPj0gc3RhcnQ7IC0taSkge1xuICAgICAgY29kZSA9IHBhdGguY2hhckNvZGVBdChpKTtcbiAgICAgIGlmIChjb2RlID09PSA0NyAvKi8qLykge1xuICAgICAgICAgIC8vIElmIHdlIHJlYWNoZWQgYSBwYXRoIHNlcGFyYXRvciB0aGF0IHdhcyBub3QgcGFydCBvZiBhIHNldCBvZiBwYXRoXG4gICAgICAgICAgLy8gc2VwYXJhdG9ycyBhdCB0aGUgZW5kIG9mIHRoZSBzdHJpbmcsIHN0b3Agbm93XG4gICAgICAgICAgaWYgKCFtYXRjaGVkU2xhc2gpIHtcbiAgICAgICAgICAgIHN0YXJ0UGFydCA9IGkgKyAxO1xuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgfVxuICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICB9XG4gICAgICBpZiAoZW5kID09PSAtMSkge1xuICAgICAgICAvLyBXZSBzYXcgdGhlIGZpcnN0IG5vbi1wYXRoIHNlcGFyYXRvciwgbWFyayB0aGlzIGFzIHRoZSBlbmQgb2Ygb3VyXG4gICAgICAgIC8vIGV4dGVuc2lvblxuICAgICAgICBtYXRjaGVkU2xhc2ggPSBmYWxzZTtcbiAgICAgICAgZW5kID0gaSArIDE7XG4gICAgICB9XG4gICAgICBpZiAoY29kZSA9PT0gNDYgLyouKi8pIHtcbiAgICAgICAgICAvLyBJZiB0aGlzIGlzIG91ciBmaXJzdCBkb3QsIG1hcmsgaXQgYXMgdGhlIHN0YXJ0IG9mIG91ciBleHRlbnNpb25cbiAgICAgICAgICBpZiAoc3RhcnREb3QgPT09IC0xKSBzdGFydERvdCA9IGk7ZWxzZSBpZiAocHJlRG90U3RhdGUgIT09IDEpIHByZURvdFN0YXRlID0gMTtcbiAgICAgICAgfSBlbHNlIGlmIChzdGFydERvdCAhPT0gLTEpIHtcbiAgICAgICAgLy8gV2Ugc2F3IGEgbm9uLWRvdCBhbmQgbm9uLXBhdGggc2VwYXJhdG9yIGJlZm9yZSBvdXIgZG90LCBzbyB3ZSBzaG91bGRcbiAgICAgICAgLy8gaGF2ZSBhIGdvb2QgY2hhbmNlIGF0IGhhdmluZyBhIG5vbi1lbXB0eSBleHRlbnNpb25cbiAgICAgICAgcHJlRG90U3RhdGUgPSAtMTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICBpZiAoc3RhcnREb3QgPT09IC0xIHx8IGVuZCA9PT0gLTEgfHxcbiAgICAvLyBXZSBzYXcgYSBub24tZG90IGNoYXJhY3RlciBpbW1lZGlhdGVseSBiZWZvcmUgdGhlIGRvdFxuICAgIHByZURvdFN0YXRlID09PSAwIHx8XG4gICAgLy8gVGhlIChyaWdodC1tb3N0KSB0cmltbWVkIHBhdGggY29tcG9uZW50IGlzIGV4YWN0bHkgJy4uJ1xuICAgIHByZURvdFN0YXRlID09PSAxICYmIHN0YXJ0RG90ID09PSBlbmQgLSAxICYmIHN0YXJ0RG90ID09PSBzdGFydFBhcnQgKyAxKSB7XG4gICAgICBpZiAoZW5kICE9PSAtMSkge1xuICAgICAgICBpZiAoc3RhcnRQYXJ0ID09PSAwICYmIGlzQWJzb2x1dGUpIHJldC5iYXNlID0gcmV0Lm5hbWUgPSBwYXRoLnNsaWNlKDEsIGVuZCk7ZWxzZSByZXQuYmFzZSA9IHJldC5uYW1lID0gcGF0aC5zbGljZShzdGFydFBhcnQsIGVuZCk7XG4gICAgICB9XG4gICAgfSBlbHNlIHtcbiAgICAgIGlmIChzdGFydFBhcnQgPT09IDAgJiYgaXNBYnNvbHV0ZSkge1xuICAgICAgICByZXQubmFtZSA9IHBhdGguc2xpY2UoMSwgc3RhcnREb3QpO1xuICAgICAgICByZXQuYmFzZSA9IHBhdGguc2xpY2UoMSwgZW5kKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHJldC5uYW1lID0gcGF0aC5zbGljZShzdGFydFBhcnQsIHN0YXJ0RG90KTtcbiAgICAgICAgcmV0LmJhc2UgPSBwYXRoLnNsaWNlKHN0YXJ0UGFydCwgZW5kKTtcbiAgICAgIH1cbiAgICAgIHJldC5leHQgPSBwYXRoLnNsaWNlKHN0YXJ0RG90LCBlbmQpO1xuICAgIH1cblxuICAgIGlmIChzdGFydFBhcnQgPiAwKSByZXQuZGlyID0gcGF0aC5zbGljZSgwLCBzdGFydFBhcnQgLSAxKTtlbHNlIGlmIChpc0Fic29sdXRlKSByZXQuZGlyID0gJy8nO1xuXG4gICAgcmV0dXJuIHJldDtcbiAgfSxcblxuICBzZXA6ICcvJyxcbiAgZGVsaW1pdGVyOiAnOicsXG4gIHdpbjMyOiBudWxsLFxuICBwb3NpeDogbnVsbFxufTtcblxucG9zaXgucG9zaXggPSBwb3NpeDtcblxubW9kdWxlLmV4cG9ydHMgPSBwb3NpeDtcbiIsImltcG9ydCB7IGV4dG5hbWUgfSBmcm9tIFwicGF0aC1icm93c2VyaWZ5XCI7XHJcbmltcG9ydCB7IFJlYWRhYmxlIH0gZnJvbSBcInN0cmVhbVwiO1xyXG5cclxuZXhwb3J0IGludGVyZmFjZSBJU3RyaW5nS2V5TWFwPFQ+IHtcclxuICBba2V5OiBzdHJpbmddOiBUO1xyXG59XHJcblxyXG5jb25zdCBJTUFHRV9FWFRfTElTVCA9IFtcclxuICBcIi5wbmdcIixcclxuICBcIi5qcGdcIixcclxuICBcIi5qcGVnXCIsXHJcbiAgXCIuYm1wXCIsXHJcbiAgXCIuZ2lmXCIsXHJcbiAgXCIuc3ZnXCIsXHJcbiAgXCIudGlmZlwiLFxyXG4gIFwiLndlYnBcIixcclxuICBcIi5hdmlmXCIsXHJcbl07XHJcblxyXG5leHBvcnQgZnVuY3Rpb24gaXNBbkltYWdlKGV4dDogc3RyaW5nKSB7XHJcbiAgcmV0dXJuIElNQUdFX0VYVF9MSVNULmluY2x1ZGVzKGV4dC50b0xvd2VyQ2FzZSgpKTtcclxufVxyXG5leHBvcnQgZnVuY3Rpb24gaXNBc3NldFR5cGVBbkltYWdlKHBhdGg6IHN0cmluZyk6IEJvb2xlYW4ge1xyXG4gIHJldHVybiBpc0FuSW1hZ2UoZXh0bmFtZShwYXRoKSk7XHJcbn1cclxuXHJcbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBzdHJlYW1Ub1N0cmluZyhzdHJlYW06IFJlYWRhYmxlKSB7XHJcbiAgY29uc3QgY2h1bmtzID0gW107XHJcblxyXG4gIGZvciBhd2FpdCAoY29uc3QgY2h1bmsgb2Ygc3RyZWFtKSB7XHJcbiAgICBjaHVua3MucHVzaChCdWZmZXIuZnJvbShjaHVuaykpO1xyXG4gIH1cclxuXHJcbiAgLy8gQHRzLWlnbm9yZVxyXG4gIHJldHVybiBCdWZmZXIuY29uY2F0KGNodW5rcykudG9TdHJpbmcoXCJ1dGYtOFwiKTtcclxufVxyXG5cclxuZXhwb3J0IGZ1bmN0aW9uIGdldFVybEFzc2V0KHVybDogc3RyaW5nKSB7XHJcbiAgcmV0dXJuICh1cmwgPSB1cmwuc3Vic3RyKDEgKyB1cmwubGFzdEluZGV4T2YoXCIvXCIpKS5zcGxpdChcIj9cIilbMF0pLnNwbGl0KFxyXG4gICAgXCIjXCJcclxuICApWzBdO1xyXG59XHJcblxyXG5leHBvcnQgZnVuY3Rpb24gZ2V0TGFzdEltYWdlKGxpc3Q6IHN0cmluZ1tdKSB7XHJcbiAgY29uc3QgcmV2ZXJzZWRMaXN0ID0gbGlzdC5yZXZlcnNlKCk7XHJcbiAgbGV0IGxhc3RJbWFnZTtcclxuICByZXZlcnNlZExpc3QuZm9yRWFjaChpdGVtID0+IHtcclxuICAgIGlmIChpdGVtICYmIGl0ZW0uc3RhcnRzV2l0aChcImh0dHBcIikpIHtcclxuICAgICAgbGFzdEltYWdlID0gaXRlbTtcclxuICAgICAgcmV0dXJuIGl0ZW07XHJcbiAgICB9XHJcbiAgfSk7XHJcbiAgcmV0dXJuIGxhc3RJbWFnZTtcclxufVxyXG5cclxuaW50ZXJmYWNlIEFueU9iaiB7XHJcbiAgW2tleTogc3RyaW5nXTogYW55O1xyXG59XHJcblxyXG5leHBvcnQgZnVuY3Rpb24gYXJyYXlUb09iamVjdDxUIGV4dGVuZHMgQW55T2JqPihcclxuICBhcnI6IFRbXSxcclxuICBrZXk6IHN0cmluZ1xyXG4pOiB7IFtrZXk6IHN0cmluZ106IFQgfSB7XHJcbiAgY29uc3Qgb2JqOiB7IFtrZXk6IHN0cmluZ106IFQgfSA9IHt9O1xyXG4gIGFyci5mb3JFYWNoKGVsZW1lbnQgPT4ge1xyXG4gICAgb2JqW2VsZW1lbnRba2V5XV0gPSBlbGVtZW50O1xyXG4gIH0pO1xyXG4gIHJldHVybiBvYmo7XHJcbn1cclxuXHJcbmV4cG9ydCBmdW5jdGlvbiBidWZmZXJUb0FycmF5QnVmZmVyKGJ1ZmZlcjogQnVmZmVyKSB7XHJcbiAgY29uc3QgYXJyYXlCdWZmZXIgPSBuZXcgQXJyYXlCdWZmZXIoYnVmZmVyLmxlbmd0aCk7XHJcbiAgY29uc3QgdmlldyA9IG5ldyBVaW50OEFycmF5KGFycmF5QnVmZmVyKTtcclxuICBmb3IgKGxldCBpID0gMDsgaSA8IGJ1ZmZlci5sZW5ndGg7IGkrKykge1xyXG4gICAgdmlld1tpXSA9IGJ1ZmZlcltpXTtcclxuICB9XHJcbiAgcmV0dXJuIGFycmF5QnVmZmVyO1xyXG59XHJcblxyXG5leHBvcnQgZnVuY3Rpb24gYXJyYXlCdWZmZXJUb0J1ZmZlcihhcnJheUJ1ZmZlcjogQXJyYXlCdWZmZXIpIHtcclxuICBjb25zdCBidWZmZXIgPSBCdWZmZXIuYWxsb2MoYXJyYXlCdWZmZXIuYnl0ZUxlbmd0aCk7XHJcbiAgY29uc3QgdmlldyA9IG5ldyBVaW50OEFycmF5KGFycmF5QnVmZmVyKTtcclxuICBmb3IgKGxldCBpID0gMDsgaSA8IGJ1ZmZlci5sZW5ndGg7ICsraSkge1xyXG4gICAgYnVmZmVyW2ldID0gdmlld1tpXTtcclxuICB9XHJcbiAgcmV0dXJuIGJ1ZmZlcjtcclxufVxyXG5cclxuZXhwb3J0IGZ1bmN0aW9uIHV1aWQoKSB7XHJcbiAgcmV0dXJuIE1hdGgucmFuZG9tKCkudG9TdHJpbmcoMzYpLnNsaWNlKDIpO1xyXG59XHJcbiIsImltcG9ydCAqIGFzIGllZWU3NTQgZnJvbSAnaWVlZTc1NCc7XG5pbXBvcnQgeyBCdWZmZXIgfSBmcm9tICdub2RlOmJ1ZmZlcic7XG4vLyBQcmltaXRpdmUgdHlwZXNcbmZ1bmN0aW9uIGR2KGFycmF5KSB7XG4gICAgcmV0dXJuIG5ldyBEYXRhVmlldyhhcnJheS5idWZmZXIsIGFycmF5LmJ5dGVPZmZzZXQpO1xufVxuLyoqXG4gKiA4LWJpdCB1bnNpZ25lZCBpbnRlZ2VyXG4gKi9cbmV4cG9ydCBjb25zdCBVSU5UOCA9IHtcbiAgICBsZW46IDEsXG4gICAgZ2V0KGFycmF5LCBvZmZzZXQpIHtcbiAgICAgICAgcmV0dXJuIGR2KGFycmF5KS5nZXRVaW50OChvZmZzZXQpO1xuICAgIH0sXG4gICAgcHV0KGFycmF5LCBvZmZzZXQsIHZhbHVlKSB7XG4gICAgICAgIGR2KGFycmF5KS5zZXRVaW50OChvZmZzZXQsIHZhbHVlKTtcbiAgICAgICAgcmV0dXJuIG9mZnNldCArIDE7XG4gICAgfVxufTtcbi8qKlxuICogMTYtYml0IHVuc2lnbmVkIGludGVnZXIsIExpdHRsZSBFbmRpYW4gYnl0ZSBvcmRlclxuICovXG5leHBvcnQgY29uc3QgVUlOVDE2X0xFID0ge1xuICAgIGxlbjogMixcbiAgICBnZXQoYXJyYXksIG9mZnNldCkge1xuICAgICAgICByZXR1cm4gZHYoYXJyYXkpLmdldFVpbnQxNihvZmZzZXQsIHRydWUpO1xuICAgIH0sXG4gICAgcHV0KGFycmF5LCBvZmZzZXQsIHZhbHVlKSB7XG4gICAgICAgIGR2KGFycmF5KS5zZXRVaW50MTYob2Zmc2V0LCB2YWx1ZSwgdHJ1ZSk7XG4gICAgICAgIHJldHVybiBvZmZzZXQgKyAyO1xuICAgIH1cbn07XG4vKipcbiAqIDE2LWJpdCB1bnNpZ25lZCBpbnRlZ2VyLCBCaWcgRW5kaWFuIGJ5dGUgb3JkZXJcbiAqL1xuZXhwb3J0IGNvbnN0IFVJTlQxNl9CRSA9IHtcbiAgICBsZW46IDIsXG4gICAgZ2V0KGFycmF5LCBvZmZzZXQpIHtcbiAgICAgICAgcmV0dXJuIGR2KGFycmF5KS5nZXRVaW50MTYob2Zmc2V0KTtcbiAgICB9LFxuICAgIHB1dChhcnJheSwgb2Zmc2V0LCB2YWx1ZSkge1xuICAgICAgICBkdihhcnJheSkuc2V0VWludDE2KG9mZnNldCwgdmFsdWUpO1xuICAgICAgICByZXR1cm4gb2Zmc2V0ICsgMjtcbiAgICB9XG59O1xuLyoqXG4gKiAyNC1iaXQgdW5zaWduZWQgaW50ZWdlciwgTGl0dGxlIEVuZGlhbiBieXRlIG9yZGVyXG4gKi9cbmV4cG9ydCBjb25zdCBVSU5UMjRfTEUgPSB7XG4gICAgbGVuOiAzLFxuICAgIGdldChhcnJheSwgb2Zmc2V0KSB7XG4gICAgICAgIGNvbnN0IGRhdGFWaWV3ID0gZHYoYXJyYXkpO1xuICAgICAgICByZXR1cm4gZGF0YVZpZXcuZ2V0VWludDgob2Zmc2V0KSArIChkYXRhVmlldy5nZXRVaW50MTYob2Zmc2V0ICsgMSwgdHJ1ZSkgPDwgOCk7XG4gICAgfSxcbiAgICBwdXQoYXJyYXksIG9mZnNldCwgdmFsdWUpIHtcbiAgICAgICAgY29uc3QgZGF0YVZpZXcgPSBkdihhcnJheSk7XG4gICAgICAgIGRhdGFWaWV3LnNldFVpbnQ4KG9mZnNldCwgdmFsdWUgJiAweGZmKTtcbiAgICAgICAgZGF0YVZpZXcuc2V0VWludDE2KG9mZnNldCArIDEsIHZhbHVlID4+IDgsIHRydWUpO1xuICAgICAgICByZXR1cm4gb2Zmc2V0ICsgMztcbiAgICB9XG59O1xuLyoqXG4gKiAyNC1iaXQgdW5zaWduZWQgaW50ZWdlciwgQmlnIEVuZGlhbiBieXRlIG9yZGVyXG4gKi9cbmV4cG9ydCBjb25zdCBVSU5UMjRfQkUgPSB7XG4gICAgbGVuOiAzLFxuICAgIGdldChhcnJheSwgb2Zmc2V0KSB7XG4gICAgICAgIGNvbnN0IGRhdGFWaWV3ID0gZHYoYXJyYXkpO1xuICAgICAgICByZXR1cm4gKGRhdGFWaWV3LmdldFVpbnQxNihvZmZzZXQpIDw8IDgpICsgZGF0YVZpZXcuZ2V0VWludDgob2Zmc2V0ICsgMik7XG4gICAgfSxcbiAgICBwdXQoYXJyYXksIG9mZnNldCwgdmFsdWUpIHtcbiAgICAgICAgY29uc3QgZGF0YVZpZXcgPSBkdihhcnJheSk7XG4gICAgICAgIGRhdGFWaWV3LnNldFVpbnQxNihvZmZzZXQsIHZhbHVlID4+IDgpO1xuICAgICAgICBkYXRhVmlldy5zZXRVaW50OChvZmZzZXQgKyAyLCB2YWx1ZSAmIDB4ZmYpO1xuICAgICAgICByZXR1cm4gb2Zmc2V0ICsgMztcbiAgICB9XG59O1xuLyoqXG4gKiAzMi1iaXQgdW5zaWduZWQgaW50ZWdlciwgTGl0dGxlIEVuZGlhbiBieXRlIG9yZGVyXG4gKi9cbmV4cG9ydCBjb25zdCBVSU5UMzJfTEUgPSB7XG4gICAgbGVuOiA0LFxuICAgIGdldChhcnJheSwgb2Zmc2V0KSB7XG4gICAgICAgIHJldHVybiBkdihhcnJheSkuZ2V0VWludDMyKG9mZnNldCwgdHJ1ZSk7XG4gICAgfSxcbiAgICBwdXQoYXJyYXksIG9mZnNldCwgdmFsdWUpIHtcbiAgICAgICAgZHYoYXJyYXkpLnNldFVpbnQzMihvZmZzZXQsIHZhbHVlLCB0cnVlKTtcbiAgICAgICAgcmV0dXJuIG9mZnNldCArIDQ7XG4gICAgfVxufTtcbi8qKlxuICogMzItYml0IHVuc2lnbmVkIGludGVnZXIsIEJpZyBFbmRpYW4gYnl0ZSBvcmRlclxuICovXG5leHBvcnQgY29uc3QgVUlOVDMyX0JFID0ge1xuICAgIGxlbjogNCxcbiAgICBnZXQoYXJyYXksIG9mZnNldCkge1xuICAgICAgICByZXR1cm4gZHYoYXJyYXkpLmdldFVpbnQzMihvZmZzZXQpO1xuICAgIH0sXG4gICAgcHV0KGFycmF5LCBvZmZzZXQsIHZhbHVlKSB7XG4gICAgICAgIGR2KGFycmF5KS5zZXRVaW50MzIob2Zmc2V0LCB2YWx1ZSk7XG4gICAgICAgIHJldHVybiBvZmZzZXQgKyA0O1xuICAgIH1cbn07XG4vKipcbiAqIDgtYml0IHNpZ25lZCBpbnRlZ2VyXG4gKi9cbmV4cG9ydCBjb25zdCBJTlQ4ID0ge1xuICAgIGxlbjogMSxcbiAgICBnZXQoYXJyYXksIG9mZnNldCkge1xuICAgICAgICByZXR1cm4gZHYoYXJyYXkpLmdldEludDgob2Zmc2V0KTtcbiAgICB9LFxuICAgIHB1dChhcnJheSwgb2Zmc2V0LCB2YWx1ZSkge1xuICAgICAgICBkdihhcnJheSkuc2V0SW50OChvZmZzZXQsIHZhbHVlKTtcbiAgICAgICAgcmV0dXJuIG9mZnNldCArIDE7XG4gICAgfVxufTtcbi8qKlxuICogMTYtYml0IHNpZ25lZCBpbnRlZ2VyLCBCaWcgRW5kaWFuIGJ5dGUgb3JkZXJcbiAqL1xuZXhwb3J0IGNvbnN0IElOVDE2X0JFID0ge1xuICAgIGxlbjogMixcbiAgICBnZXQoYXJyYXksIG9mZnNldCkge1xuICAgICAgICByZXR1cm4gZHYoYXJyYXkpLmdldEludDE2KG9mZnNldCk7XG4gICAgfSxcbiAgICBwdXQoYXJyYXksIG9mZnNldCwgdmFsdWUpIHtcbiAgICAgICAgZHYoYXJyYXkpLnNldEludDE2KG9mZnNldCwgdmFsdWUpO1xuICAgICAgICByZXR1cm4gb2Zmc2V0ICsgMjtcbiAgICB9XG59O1xuLyoqXG4gKiAxNi1iaXQgc2lnbmVkIGludGVnZXIsIExpdHRsZSBFbmRpYW4gYnl0ZSBvcmRlclxuICovXG5leHBvcnQgY29uc3QgSU5UMTZfTEUgPSB7XG4gICAgbGVuOiAyLFxuICAgIGdldChhcnJheSwgb2Zmc2V0KSB7XG4gICAgICAgIHJldHVybiBkdihhcnJheSkuZ2V0SW50MTYob2Zmc2V0LCB0cnVlKTtcbiAgICB9LFxuICAgIHB1dChhcnJheSwgb2Zmc2V0LCB2YWx1ZSkge1xuICAgICAgICBkdihhcnJheSkuc2V0SW50MTYob2Zmc2V0LCB2YWx1ZSwgdHJ1ZSk7XG4gICAgICAgIHJldHVybiBvZmZzZXQgKyAyO1xuICAgIH1cbn07XG4vKipcbiAqIDI0LWJpdCBzaWduZWQgaW50ZWdlciwgTGl0dGxlIEVuZGlhbiBieXRlIG9yZGVyXG4gKi9cbmV4cG9ydCBjb25zdCBJTlQyNF9MRSA9IHtcbiAgICBsZW46IDMsXG4gICAgZ2V0KGFycmF5LCBvZmZzZXQpIHtcbiAgICAgICAgY29uc3QgdW5zaWduZWQgPSBVSU5UMjRfTEUuZ2V0KGFycmF5LCBvZmZzZXQpO1xuICAgICAgICByZXR1cm4gdW5zaWduZWQgPiAweDdmZmZmZiA/IHVuc2lnbmVkIC0gMHgxMDAwMDAwIDogdW5zaWduZWQ7XG4gICAgfSxcbiAgICBwdXQoYXJyYXksIG9mZnNldCwgdmFsdWUpIHtcbiAgICAgICAgY29uc3QgZGF0YVZpZXcgPSBkdihhcnJheSk7XG4gICAgICAgIGRhdGFWaWV3LnNldFVpbnQ4KG9mZnNldCwgdmFsdWUgJiAweGZmKTtcbiAgICAgICAgZGF0YVZpZXcuc2V0VWludDE2KG9mZnNldCArIDEsIHZhbHVlID4+IDgsIHRydWUpO1xuICAgICAgICByZXR1cm4gb2Zmc2V0ICsgMztcbiAgICB9XG59O1xuLyoqXG4gKiAyNC1iaXQgc2lnbmVkIGludGVnZXIsIEJpZyBFbmRpYW4gYnl0ZSBvcmRlclxuICovXG5leHBvcnQgY29uc3QgSU5UMjRfQkUgPSB7XG4gICAgbGVuOiAzLFxuICAgIGdldChhcnJheSwgb2Zmc2V0KSB7XG4gICAgICAgIGNvbnN0IHVuc2lnbmVkID0gVUlOVDI0X0JFLmdldChhcnJheSwgb2Zmc2V0KTtcbiAgICAgICAgcmV0dXJuIHVuc2lnbmVkID4gMHg3ZmZmZmYgPyB1bnNpZ25lZCAtIDB4MTAwMDAwMCA6IHVuc2lnbmVkO1xuICAgIH0sXG4gICAgcHV0KGFycmF5LCBvZmZzZXQsIHZhbHVlKSB7XG4gICAgICAgIGNvbnN0IGRhdGFWaWV3ID0gZHYoYXJyYXkpO1xuICAgICAgICBkYXRhVmlldy5zZXRVaW50MTYob2Zmc2V0LCB2YWx1ZSA+PiA4KTtcbiAgICAgICAgZGF0YVZpZXcuc2V0VWludDgob2Zmc2V0ICsgMiwgdmFsdWUgJiAweGZmKTtcbiAgICAgICAgcmV0dXJuIG9mZnNldCArIDM7XG4gICAgfVxufTtcbi8qKlxuICogMzItYml0IHNpZ25lZCBpbnRlZ2VyLCBCaWcgRW5kaWFuIGJ5dGUgb3JkZXJcbiAqL1xuZXhwb3J0IGNvbnN0IElOVDMyX0JFID0ge1xuICAgIGxlbjogNCxcbiAgICBnZXQoYXJyYXksIG9mZnNldCkge1xuICAgICAgICByZXR1cm4gZHYoYXJyYXkpLmdldEludDMyKG9mZnNldCk7XG4gICAgfSxcbiAgICBwdXQoYXJyYXksIG9mZnNldCwgdmFsdWUpIHtcbiAgICAgICAgZHYoYXJyYXkpLnNldEludDMyKG9mZnNldCwgdmFsdWUpO1xuICAgICAgICByZXR1cm4gb2Zmc2V0ICsgNDtcbiAgICB9XG59O1xuLyoqXG4gKiAzMi1iaXQgc2lnbmVkIGludGVnZXIsIEJpZyBFbmRpYW4gYnl0ZSBvcmRlclxuICovXG5leHBvcnQgY29uc3QgSU5UMzJfTEUgPSB7XG4gICAgbGVuOiA0LFxuICAgIGdldChhcnJheSwgb2Zmc2V0KSB7XG4gICAgICAgIHJldHVybiBkdihhcnJheSkuZ2V0SW50MzIob2Zmc2V0LCB0cnVlKTtcbiAgICB9LFxuICAgIHB1dChhcnJheSwgb2Zmc2V0LCB2YWx1ZSkge1xuICAgICAgICBkdihhcnJheSkuc2V0SW50MzIob2Zmc2V0LCB2YWx1ZSwgdHJ1ZSk7XG4gICAgICAgIHJldHVybiBvZmZzZXQgKyA0O1xuICAgIH1cbn07XG4vKipcbiAqIDY0LWJpdCB1bnNpZ25lZCBpbnRlZ2VyLCBMaXR0bGUgRW5kaWFuIGJ5dGUgb3JkZXJcbiAqL1xuZXhwb3J0IGNvbnN0IFVJTlQ2NF9MRSA9IHtcbiAgICBsZW46IDgsXG4gICAgZ2V0KGFycmF5LCBvZmZzZXQpIHtcbiAgICAgICAgcmV0dXJuIGR2KGFycmF5KS5nZXRCaWdVaW50NjQob2Zmc2V0LCB0cnVlKTtcbiAgICB9LFxuICAgIHB1dChhcnJheSwgb2Zmc2V0LCB2YWx1ZSkge1xuICAgICAgICBkdihhcnJheSkuc2V0QmlnVWludDY0KG9mZnNldCwgdmFsdWUsIHRydWUpO1xuICAgICAgICByZXR1cm4gb2Zmc2V0ICsgODtcbiAgICB9XG59O1xuLyoqXG4gKiA2NC1iaXQgc2lnbmVkIGludGVnZXIsIExpdHRsZSBFbmRpYW4gYnl0ZSBvcmRlclxuICovXG5leHBvcnQgY29uc3QgSU5UNjRfTEUgPSB7XG4gICAgbGVuOiA4LFxuICAgIGdldChhcnJheSwgb2Zmc2V0KSB7XG4gICAgICAgIHJldHVybiBkdihhcnJheSkuZ2V0QmlnSW50NjQob2Zmc2V0LCB0cnVlKTtcbiAgICB9LFxuICAgIHB1dChhcnJheSwgb2Zmc2V0LCB2YWx1ZSkge1xuICAgICAgICBkdihhcnJheSkuc2V0QmlnSW50NjQob2Zmc2V0LCB2YWx1ZSwgdHJ1ZSk7XG4gICAgICAgIHJldHVybiBvZmZzZXQgKyA4O1xuICAgIH1cbn07XG4vKipcbiAqIDY0LWJpdCB1bnNpZ25lZCBpbnRlZ2VyLCBCaWcgRW5kaWFuIGJ5dGUgb3JkZXJcbiAqL1xuZXhwb3J0IGNvbnN0IFVJTlQ2NF9CRSA9IHtcbiAgICBsZW46IDgsXG4gICAgZ2V0KGFycmF5LCBvZmZzZXQpIHtcbiAgICAgICAgcmV0dXJuIGR2KGFycmF5KS5nZXRCaWdVaW50NjQob2Zmc2V0KTtcbiAgICB9LFxuICAgIHB1dChhcnJheSwgb2Zmc2V0LCB2YWx1ZSkge1xuICAgICAgICBkdihhcnJheSkuc2V0QmlnVWludDY0KG9mZnNldCwgdmFsdWUpO1xuICAgICAgICByZXR1cm4gb2Zmc2V0ICsgODtcbiAgICB9XG59O1xuLyoqXG4gKiA2NC1iaXQgc2lnbmVkIGludGVnZXIsIEJpZyBFbmRpYW4gYnl0ZSBvcmRlclxuICovXG5leHBvcnQgY29uc3QgSU5UNjRfQkUgPSB7XG4gICAgbGVuOiA4LFxuICAgIGdldChhcnJheSwgb2Zmc2V0KSB7XG4gICAgICAgIHJldHVybiBkdihhcnJheSkuZ2V0QmlnSW50NjQob2Zmc2V0KTtcbiAgICB9LFxuICAgIHB1dChhcnJheSwgb2Zmc2V0LCB2YWx1ZSkge1xuICAgICAgICBkdihhcnJheSkuc2V0QmlnSW50NjQob2Zmc2V0LCB2YWx1ZSk7XG4gICAgICAgIHJldHVybiBvZmZzZXQgKyA4O1xuICAgIH1cbn07XG4vKipcbiAqIElFRUUgNzU0IDE2LWJpdCAoaGFsZiBwcmVjaXNpb24pIGZsb2F0LCBiaWcgZW5kaWFuXG4gKi9cbmV4cG9ydCBjb25zdCBGbG9hdDE2X0JFID0ge1xuICAgIGxlbjogMixcbiAgICBnZXQoZGF0YVZpZXcsIG9mZnNldCkge1xuICAgICAgICByZXR1cm4gaWVlZTc1NC5yZWFkKGRhdGFWaWV3LCBvZmZzZXQsIGZhbHNlLCAxMCwgdGhpcy5sZW4pO1xuICAgIH0sXG4gICAgcHV0KGRhdGFWaWV3LCBvZmZzZXQsIHZhbHVlKSB7XG4gICAgICAgIGllZWU3NTQud3JpdGUoZGF0YVZpZXcsIHZhbHVlLCBvZmZzZXQsIGZhbHNlLCAxMCwgdGhpcy5sZW4pO1xuICAgICAgICByZXR1cm4gb2Zmc2V0ICsgdGhpcy5sZW47XG4gICAgfVxufTtcbi8qKlxuICogSUVFRSA3NTQgMTYtYml0IChoYWxmIHByZWNpc2lvbikgZmxvYXQsIGxpdHRsZSBlbmRpYW5cbiAqL1xuZXhwb3J0IGNvbnN0IEZsb2F0MTZfTEUgPSB7XG4gICAgbGVuOiAyLFxuICAgIGdldChhcnJheSwgb2Zmc2V0KSB7XG4gICAgICAgIHJldHVybiBpZWVlNzU0LnJlYWQoYXJyYXksIG9mZnNldCwgdHJ1ZSwgMTAsIHRoaXMubGVuKTtcbiAgICB9LFxuICAgIHB1dChhcnJheSwgb2Zmc2V0LCB2YWx1ZSkge1xuICAgICAgICBpZWVlNzU0LndyaXRlKGFycmF5LCB2YWx1ZSwgb2Zmc2V0LCB0cnVlLCAxMCwgdGhpcy5sZW4pO1xuICAgICAgICByZXR1cm4gb2Zmc2V0ICsgdGhpcy5sZW47XG4gICAgfVxufTtcbi8qKlxuICogSUVFRSA3NTQgMzItYml0IChzaW5nbGUgcHJlY2lzaW9uKSBmbG9hdCwgYmlnIGVuZGlhblxuICovXG5leHBvcnQgY29uc3QgRmxvYXQzMl9CRSA9IHtcbiAgICBsZW46IDQsXG4gICAgZ2V0KGFycmF5LCBvZmZzZXQpIHtcbiAgICAgICAgcmV0dXJuIGR2KGFycmF5KS5nZXRGbG9hdDMyKG9mZnNldCk7XG4gICAgfSxcbiAgICBwdXQoYXJyYXksIG9mZnNldCwgdmFsdWUpIHtcbiAgICAgICAgZHYoYXJyYXkpLnNldEZsb2F0MzIob2Zmc2V0LCB2YWx1ZSk7XG4gICAgICAgIHJldHVybiBvZmZzZXQgKyA0O1xuICAgIH1cbn07XG4vKipcbiAqIElFRUUgNzU0IDMyLWJpdCAoc2luZ2xlIHByZWNpc2lvbikgZmxvYXQsIGxpdHRsZSBlbmRpYW5cbiAqL1xuZXhwb3J0IGNvbnN0IEZsb2F0MzJfTEUgPSB7XG4gICAgbGVuOiA0LFxuICAgIGdldChhcnJheSwgb2Zmc2V0KSB7XG4gICAgICAgIHJldHVybiBkdihhcnJheSkuZ2V0RmxvYXQzMihvZmZzZXQsIHRydWUpO1xuICAgIH0sXG4gICAgcHV0KGFycmF5LCBvZmZzZXQsIHZhbHVlKSB7XG4gICAgICAgIGR2KGFycmF5KS5zZXRGbG9hdDMyKG9mZnNldCwgdmFsdWUsIHRydWUpO1xuICAgICAgICByZXR1cm4gb2Zmc2V0ICsgNDtcbiAgICB9XG59O1xuLyoqXG4gKiBJRUVFIDc1NCA2NC1iaXQgKGRvdWJsZSBwcmVjaXNpb24pIGZsb2F0LCBiaWcgZW5kaWFuXG4gKi9cbmV4cG9ydCBjb25zdCBGbG9hdDY0X0JFID0ge1xuICAgIGxlbjogOCxcbiAgICBnZXQoYXJyYXksIG9mZnNldCkge1xuICAgICAgICByZXR1cm4gZHYoYXJyYXkpLmdldEZsb2F0NjQob2Zmc2V0KTtcbiAgICB9LFxuICAgIHB1dChhcnJheSwgb2Zmc2V0LCB2YWx1ZSkge1xuICAgICAgICBkdihhcnJheSkuc2V0RmxvYXQ2NChvZmZzZXQsIHZhbHVlKTtcbiAgICAgICAgcmV0dXJuIG9mZnNldCArIDg7XG4gICAgfVxufTtcbi8qKlxuICogSUVFRSA3NTQgNjQtYml0IChkb3VibGUgcHJlY2lzaW9uKSBmbG9hdCwgbGl0dGxlIGVuZGlhblxuICovXG5leHBvcnQgY29uc3QgRmxvYXQ2NF9MRSA9IHtcbiAgICBsZW46IDgsXG4gICAgZ2V0KGFycmF5LCBvZmZzZXQpIHtcbiAgICAgICAgcmV0dXJuIGR2KGFycmF5KS5nZXRGbG9hdDY0KG9mZnNldCwgdHJ1ZSk7XG4gICAgfSxcbiAgICBwdXQoYXJyYXksIG9mZnNldCwgdmFsdWUpIHtcbiAgICAgICAgZHYoYXJyYXkpLnNldEZsb2F0NjQob2Zmc2V0LCB2YWx1ZSwgdHJ1ZSk7XG4gICAgICAgIHJldHVybiBvZmZzZXQgKyA4O1xuICAgIH1cbn07XG4vKipcbiAqIElFRUUgNzU0IDgwLWJpdCAoZXh0ZW5kZWQgcHJlY2lzaW9uKSBmbG9hdCwgYmlnIGVuZGlhblxuICovXG5leHBvcnQgY29uc3QgRmxvYXQ4MF9CRSA9IHtcbiAgICBsZW46IDEwLFxuICAgIGdldChhcnJheSwgb2Zmc2V0KSB7XG4gICAgICAgIHJldHVybiBpZWVlNzU0LnJlYWQoYXJyYXksIG9mZnNldCwgZmFsc2UsIDYzLCB0aGlzLmxlbik7XG4gICAgfSxcbiAgICBwdXQoYXJyYXksIG9mZnNldCwgdmFsdWUpIHtcbiAgICAgICAgaWVlZTc1NC53cml0ZShhcnJheSwgdmFsdWUsIG9mZnNldCwgZmFsc2UsIDYzLCB0aGlzLmxlbik7XG4gICAgICAgIHJldHVybiBvZmZzZXQgKyB0aGlzLmxlbjtcbiAgICB9XG59O1xuLyoqXG4gKiBJRUVFIDc1NCA4MC1iaXQgKGV4dGVuZGVkIHByZWNpc2lvbikgZmxvYXQsIGxpdHRsZSBlbmRpYW5cbiAqL1xuZXhwb3J0IGNvbnN0IEZsb2F0ODBfTEUgPSB7XG4gICAgbGVuOiAxMCxcbiAgICBnZXQoYXJyYXksIG9mZnNldCkge1xuICAgICAgICByZXR1cm4gaWVlZTc1NC5yZWFkKGFycmF5LCBvZmZzZXQsIHRydWUsIDYzLCB0aGlzLmxlbik7XG4gICAgfSxcbiAgICBwdXQoYXJyYXksIG9mZnNldCwgdmFsdWUpIHtcbiAgICAgICAgaWVlZTc1NC53cml0ZShhcnJheSwgdmFsdWUsIG9mZnNldCwgdHJ1ZSwgNjMsIHRoaXMubGVuKTtcbiAgICAgICAgcmV0dXJuIG9mZnNldCArIHRoaXMubGVuO1xuICAgIH1cbn07XG4vKipcbiAqIElnbm9yZSBhIGdpdmVuIG51bWJlciBvZiBieXRlc1xuICovXG5leHBvcnQgY2xhc3MgSWdub3JlVHlwZSB7XG4gICAgLyoqXG4gICAgICogQHBhcmFtIGxlbiBudW1iZXIgb2YgYnl0ZXMgdG8gaWdub3JlXG4gICAgICovXG4gICAgY29uc3RydWN0b3IobGVuKSB7XG4gICAgICAgIHRoaXMubGVuID0gbGVuO1xuICAgIH1cbiAgICAvLyBUb0RvOiBkb24ndCByZWFkLCBidXQgc2tpcCBkYXRhXG4gICAgLy8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIEB0eXBlc2NyaXB0LWVzbGludC9uby1lbXB0eS1mdW5jdGlvblxuICAgIGdldChhcnJheSwgb2ZmKSB7XG4gICAgfVxufVxuZXhwb3J0IGNsYXNzIFVpbnQ4QXJyYXlUeXBlIHtcbiAgICBjb25zdHJ1Y3RvcihsZW4pIHtcbiAgICAgICAgdGhpcy5sZW4gPSBsZW47XG4gICAgfVxuICAgIGdldChhcnJheSwgb2Zmc2V0KSB7XG4gICAgICAgIHJldHVybiBhcnJheS5zdWJhcnJheShvZmZzZXQsIG9mZnNldCArIHRoaXMubGVuKTtcbiAgICB9XG59XG5leHBvcnQgY2xhc3MgQnVmZmVyVHlwZSB7XG4gICAgY29uc3RydWN0b3IobGVuKSB7XG4gICAgICAgIHRoaXMubGVuID0gbGVuO1xuICAgIH1cbiAgICBnZXQodWludDhBcnJheSwgb2ZmKSB7XG4gICAgICAgIHJldHVybiBCdWZmZXIuZnJvbSh1aW50OEFycmF5LnN1YmFycmF5KG9mZiwgb2ZmICsgdGhpcy5sZW4pKTtcbiAgICB9XG59XG4vKipcbiAqIENvbnN1bWUgYSBmaXhlZCBudW1iZXIgb2YgYnl0ZXMgZnJvbSB0aGUgc3RyZWFtIGFuZCByZXR1cm4gYSBzdHJpbmcgd2l0aCBhIHNwZWNpZmllZCBlbmNvZGluZy5cbiAqL1xuZXhwb3J0IGNsYXNzIFN0cmluZ1R5cGUge1xuICAgIGNvbnN0cnVjdG9yKGxlbiwgZW5jb2RpbmcpIHtcbiAgICAgICAgdGhpcy5sZW4gPSBsZW47XG4gICAgICAgIHRoaXMuZW5jb2RpbmcgPSBlbmNvZGluZztcbiAgICB9XG4gICAgZ2V0KHVpbnQ4QXJyYXksIG9mZnNldCkge1xuICAgICAgICByZXR1cm4gQnVmZmVyLmZyb20odWludDhBcnJheSkudG9TdHJpbmcodGhpcy5lbmNvZGluZywgb2Zmc2V0LCBvZmZzZXQgKyB0aGlzLmxlbik7XG4gICAgfVxufVxuLyoqXG4gKiBBTlNJIExhdGluIDEgU3RyaW5nXG4gKiBVc2luZyB3aW5kb3dzLTEyNTIgLyBJU08gODg1OS0xIGRlY29kaW5nXG4gKi9cbmV4cG9ydCBjbGFzcyBBbnNpU3RyaW5nVHlwZSB7XG4gICAgY29uc3RydWN0b3IobGVuKSB7XG4gICAgICAgIHRoaXMubGVuID0gbGVuO1xuICAgIH1cbiAgICBzdGF0aWMgZGVjb2RlKGJ1ZmZlciwgb2Zmc2V0LCB1bnRpbCkge1xuICAgICAgICBsZXQgc3RyID0gJyc7XG4gICAgICAgIGZvciAobGV0IGkgPSBvZmZzZXQ7IGkgPCB1bnRpbDsgKytpKSB7XG4gICAgICAgICAgICBzdHIgKz0gQW5zaVN0cmluZ1R5cGUuY29kZVBvaW50VG9TdHJpbmcoQW5zaVN0cmluZ1R5cGUuc2luZ2xlQnl0ZURlY29kZXIoYnVmZmVyW2ldKSk7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHN0cjtcbiAgICB9XG4gICAgc3RhdGljIGluUmFuZ2UoYSwgbWluLCBtYXgpIHtcbiAgICAgICAgcmV0dXJuIG1pbiA8PSBhICYmIGEgPD0gbWF4O1xuICAgIH1cbiAgICBzdGF0aWMgY29kZVBvaW50VG9TdHJpbmcoY3ApIHtcbiAgICAgICAgaWYgKGNwIDw9IDB4RkZGRikge1xuICAgICAgICAgICAgcmV0dXJuIFN0cmluZy5mcm9tQ2hhckNvZGUoY3ApO1xuICAgICAgICB9XG4gICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgY3AgLT0gMHgxMDAwMDtcbiAgICAgICAgICAgIHJldHVybiBTdHJpbmcuZnJvbUNoYXJDb2RlKChjcCA+PiAxMCkgKyAweEQ4MDAsIChjcCAmIDB4M0ZGKSArIDB4REMwMCk7XG4gICAgICAgIH1cbiAgICB9XG4gICAgc3RhdGljIHNpbmdsZUJ5dGVEZWNvZGVyKGJpdGUpIHtcbiAgICAgICAgaWYgKEFuc2lTdHJpbmdUeXBlLmluUmFuZ2UoYml0ZSwgMHgwMCwgMHg3RikpIHtcbiAgICAgICAgICAgIHJldHVybiBiaXRlO1xuICAgICAgICB9XG4gICAgICAgIGNvbnN0IGNvZGVQb2ludCA9IEFuc2lTdHJpbmdUeXBlLndpbmRvd3MxMjUyW2JpdGUgLSAweDgwXTtcbiAgICAgICAgaWYgKGNvZGVQb2ludCA9PT0gbnVsbCkge1xuICAgICAgICAgICAgdGhyb3cgRXJyb3IoJ2ludmFsaWRpbmcgZW5jb2RpbmcnKTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gY29kZVBvaW50O1xuICAgIH1cbiAgICBnZXQoYnVmZmVyLCBvZmZzZXQgPSAwKSB7XG4gICAgICAgIHJldHVybiBBbnNpU3RyaW5nVHlwZS5kZWNvZGUoYnVmZmVyLCBvZmZzZXQsIG9mZnNldCArIHRoaXMubGVuKTtcbiAgICB9XG59XG5BbnNpU3RyaW5nVHlwZS53aW5kb3dzMTI1MiA9IFs4MzY0LCAxMjksIDgyMTgsIDQwMiwgODIyMiwgODIzMCwgODIyNCwgODIyNSwgNzEwLCA4MjQwLCAzNTIsXG4gICAgODI0OSwgMzM4LCAxNDEsIDM4MSwgMTQzLCAxNDQsIDgyMTYsIDgyMTcsIDgyMjAsIDgyMjEsIDgyMjYsIDgyMTEsIDgyMTIsIDczMixcbiAgICA4NDgyLCAzNTMsIDgyNTAsIDMzOSwgMTU3LCAzODIsIDM3NiwgMTYwLCAxNjEsIDE2MiwgMTYzLCAxNjQsIDE2NSwgMTY2LCAxNjcsIDE2OCxcbiAgICAxNjksIDE3MCwgMTcxLCAxNzIsIDE3MywgMTc0LCAxNzUsIDE3NiwgMTc3LCAxNzgsIDE3OSwgMTgwLCAxODEsIDE4MiwgMTgzLCAxODQsXG4gICAgMTg1LCAxODYsIDE4NywgMTg4LCAxODksIDE5MCwgMTkxLCAxOTIsIDE5MywgMTk0LCAxOTUsIDE5NiwgMTk3LCAxOTgsIDE5OSwgMjAwLFxuICAgIDIwMSwgMjAyLCAyMDMsIDIwNCwgMjA1LCAyMDYsIDIwNywgMjA4LCAyMDksIDIxMCwgMjExLCAyMTIsIDIxMywgMjE0LCAyMTUsIDIxNixcbiAgICAyMTcsIDIxOCwgMjE5LCAyMjAsIDIyMSwgMjIyLCAyMjMsIDIyNCwgMjI1LCAyMjYsIDIyNywgMjI4LCAyMjksIDIzMCwgMjMxLCAyMzIsXG4gICAgMjMzLCAyMzQsIDIzNSwgMjM2LCAyMzcsIDIzOCwgMjM5LCAyNDAsIDI0MSwgMjQyLCAyNDMsIDI0NCwgMjQ1LCAyNDYsIDI0NyxcbiAgICAyNDgsIDI0OSwgMjUwLCAyNTEsIDI1MiwgMjUzLCAyNTQsIDI1NV07XG4iLCJleHBvcnQgY29uc3QgZGVmYXVsdE1lc3NhZ2VzID0gJ0VuZC1PZi1TdHJlYW0nO1xuLyoqXG4gKiBUaHJvd24gb24gcmVhZCBvcGVyYXRpb24gb2YgdGhlIGVuZCBvZiBmaWxlIG9yIHN0cmVhbSBoYXMgYmVlbiByZWFjaGVkXG4gKi9cbmV4cG9ydCBjbGFzcyBFbmRPZlN0cmVhbUVycm9yIGV4dGVuZHMgRXJyb3Ige1xuICAgIGNvbnN0cnVjdG9yKCkge1xuICAgICAgICBzdXBlcihkZWZhdWx0TWVzc2FnZXMpO1xuICAgIH1cbn1cbiIsImV4cG9ydCBjbGFzcyBEZWZlcnJlZCB7XG4gICAgY29uc3RydWN0b3IoKSB7XG4gICAgICAgIHRoaXMucmVzb2x2ZSA9ICgpID0+IG51bGw7XG4gICAgICAgIHRoaXMucmVqZWN0ID0gKCkgPT4gbnVsbDtcbiAgICAgICAgdGhpcy5wcm9taXNlID0gbmV3IFByb21pc2UoKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuICAgICAgICAgICAgdGhpcy5yZWplY3QgPSByZWplY3Q7XG4gICAgICAgICAgICB0aGlzLnJlc29sdmUgPSByZXNvbHZlO1xuICAgICAgICB9KTtcbiAgICB9XG59XG4iLCJpbXBvcnQgeyBFbmRPZlN0cmVhbUVycm9yIH0gZnJvbSBcIi4vRW5kT2ZTdHJlYW1FcnJvci5qc1wiO1xuZXhwb3J0IGNsYXNzIEFic3RyYWN0U3RyZWFtUmVhZGVyIHtcbiAgICBjb25zdHJ1Y3RvcigpIHtcbiAgICAgICAgLyoqXG4gICAgICAgICAqIE1heGltdW0gcmVxdWVzdCBsZW5ndGggb24gcmVhZC1zdHJlYW0gb3BlcmF0aW9uXG4gICAgICAgICAqL1xuICAgICAgICB0aGlzLm1heFN0cmVhbVJlYWRTaXplID0gMSAqIDEwMjQgKiAxMDI0O1xuICAgICAgICB0aGlzLmVuZE9mU3RyZWFtID0gZmFsc2U7XG4gICAgICAgIC8qKlxuICAgICAgICAgKiBTdG9yZSBwZWVrZWQgZGF0YVxuICAgICAgICAgKiBAdHlwZSB7QXJyYXl9XG4gICAgICAgICAqL1xuICAgICAgICB0aGlzLnBlZWtRdWV1ZSA9IFtdO1xuICAgIH1cbiAgICBhc3luYyBwZWVrKHVpbnQ4QXJyYXksIG9mZnNldCwgbGVuZ3RoKSB7XG4gICAgICAgIGNvbnN0IGJ5dGVzUmVhZCA9IGF3YWl0IHRoaXMucmVhZCh1aW50OEFycmF5LCBvZmZzZXQsIGxlbmd0aCk7XG4gICAgICAgIHRoaXMucGVla1F1ZXVlLnB1c2godWludDhBcnJheS5zdWJhcnJheShvZmZzZXQsIG9mZnNldCArIGJ5dGVzUmVhZCkpOyAvLyBQdXQgcmVhZCBkYXRhIGJhY2sgdG8gcGVlayBidWZmZXJcbiAgICAgICAgcmV0dXJuIGJ5dGVzUmVhZDtcbiAgICB9XG4gICAgYXN5bmMgcmVhZChidWZmZXIsIG9mZnNldCwgbGVuZ3RoKSB7XG4gICAgICAgIGlmIChsZW5ndGggPT09IDApIHtcbiAgICAgICAgICAgIHJldHVybiAwO1xuICAgICAgICB9XG4gICAgICAgIGxldCBieXRlc1JlYWQgPSB0aGlzLnJlYWRGcm9tUGVla0J1ZmZlcihidWZmZXIsIG9mZnNldCwgbGVuZ3RoKTtcbiAgICAgICAgYnl0ZXNSZWFkICs9IGF3YWl0IHRoaXMucmVhZFJlbWFpbmRlckZyb21TdHJlYW0oYnVmZmVyLCBvZmZzZXQgKyBieXRlc1JlYWQsIGxlbmd0aCAtIGJ5dGVzUmVhZCk7XG4gICAgICAgIGlmIChieXRlc1JlYWQgPT09IDApIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBFbmRPZlN0cmVhbUVycm9yKCk7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIGJ5dGVzUmVhZDtcbiAgICB9XG4gICAgLyoqXG4gICAgICogUmVhZCBjaHVuayBmcm9tIHN0cmVhbVxuICAgICAqIEBwYXJhbSBidWZmZXIgLSBUYXJnZXQgVWludDhBcnJheSAob3IgQnVmZmVyKSB0byBzdG9yZSBkYXRhIHJlYWQgZnJvbSBzdHJlYW0gaW5cbiAgICAgKiBAcGFyYW0gb2Zmc2V0IC0gT2Zmc2V0IHRhcmdldFxuICAgICAqIEBwYXJhbSBsZW5ndGggLSBOdW1iZXIgb2YgYnl0ZXMgdG8gcmVhZFxuICAgICAqIEByZXR1cm5zIE51bWJlciBvZiBieXRlcyByZWFkXG4gICAgICovXG4gICAgcmVhZEZyb21QZWVrQnVmZmVyKGJ1ZmZlciwgb2Zmc2V0LCBsZW5ndGgpIHtcbiAgICAgICAgbGV0IHJlbWFpbmluZyA9IGxlbmd0aDtcbiAgICAgICAgbGV0IGJ5dGVzUmVhZCA9IDA7XG4gICAgICAgIC8vIGNvbnN1bWUgcGVla2VkIGRhdGEgZmlyc3RcbiAgICAgICAgd2hpbGUgKHRoaXMucGVla1F1ZXVlLmxlbmd0aCA+IDAgJiYgcmVtYWluaW5nID4gMCkge1xuICAgICAgICAgICAgY29uc3QgcGVla0RhdGEgPSB0aGlzLnBlZWtRdWV1ZS5wb3AoKTsgLy8gRnJvbnQgb2YgcXVldWVcbiAgICAgICAgICAgIGlmICghcGVla0RhdGEpXG4gICAgICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdwZWVrRGF0YSBzaG91bGQgYmUgZGVmaW5lZCcpO1xuICAgICAgICAgICAgY29uc3QgbGVuQ29weSA9IE1hdGgubWluKHBlZWtEYXRhLmxlbmd0aCwgcmVtYWluaW5nKTtcbiAgICAgICAgICAgIGJ1ZmZlci5zZXQocGVla0RhdGEuc3ViYXJyYXkoMCwgbGVuQ29weSksIG9mZnNldCArIGJ5dGVzUmVhZCk7XG4gICAgICAgICAgICBieXRlc1JlYWQgKz0gbGVuQ29weTtcbiAgICAgICAgICAgIHJlbWFpbmluZyAtPSBsZW5Db3B5O1xuICAgICAgICAgICAgaWYgKGxlbkNvcHkgPCBwZWVrRGF0YS5sZW5ndGgpIHtcbiAgICAgICAgICAgICAgICAvLyByZW1haW5kZXIgYmFjayB0byBxdWV1ZVxuICAgICAgICAgICAgICAgIHRoaXMucGVla1F1ZXVlLnB1c2gocGVla0RhdGEuc3ViYXJyYXkobGVuQ29weSkpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHJldHVybiBieXRlc1JlYWQ7XG4gICAgfVxuICAgIGFzeW5jIHJlYWRSZW1haW5kZXJGcm9tU3RyZWFtKGJ1ZmZlciwgb2Zmc2V0LCBpbml0aWFsUmVtYWluaW5nKSB7XG4gICAgICAgIGxldCByZW1haW5pbmcgPSBpbml0aWFsUmVtYWluaW5nO1xuICAgICAgICBsZXQgYnl0ZXNSZWFkID0gMDtcbiAgICAgICAgLy8gQ29udGludWUgcmVhZGluZyBmcm9tIHN0cmVhbSBpZiByZXF1aXJlZFxuICAgICAgICB3aGlsZSAocmVtYWluaW5nID4gMCAmJiAhdGhpcy5lbmRPZlN0cmVhbSkge1xuICAgICAgICAgICAgY29uc3QgcmVxTGVuID0gTWF0aC5taW4ocmVtYWluaW5nLCB0aGlzLm1heFN0cmVhbVJlYWRTaXplKTtcbiAgICAgICAgICAgIGNvbnN0IGNodW5rTGVuID0gYXdhaXQgdGhpcy5yZWFkRnJvbVN0cmVhbShidWZmZXIsIG9mZnNldCArIGJ5dGVzUmVhZCwgcmVxTGVuKTtcbiAgICAgICAgICAgIGlmIChjaHVua0xlbiA9PT0gMClcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIGJ5dGVzUmVhZCArPSBjaHVua0xlbjtcbiAgICAgICAgICAgIHJlbWFpbmluZyAtPSBjaHVua0xlbjtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gYnl0ZXNSZWFkO1xuICAgIH1cbn1cbiIsImltcG9ydCB7IEVuZE9mU3RyZWFtRXJyb3IgfSBmcm9tICcuL0VuZE9mU3RyZWFtRXJyb3IuanMnO1xuaW1wb3J0IHsgRGVmZXJyZWQgfSBmcm9tICcuL0RlZmVycmVkLmpzJztcbmltcG9ydCB7IEFic3RyYWN0U3RyZWFtUmVhZGVyIH0gZnJvbSBcIi4vQWJzdHJhY3RTdHJlYW1SZWFkZXIuanNcIjtcbmV4cG9ydCB7IEVuZE9mU3RyZWFtRXJyb3IgfSBmcm9tICcuL0VuZE9mU3RyZWFtRXJyb3IuanMnO1xuLyoqXG4gKiBOb2RlLmpzIFJlYWRhYmxlIFN0cmVhbSBSZWFkZXJcbiAqIFJlZjogaHR0cHM6Ly9ub2RlanMub3JnL2FwaS9zdHJlYW0uaHRtbCNyZWFkYWJsZS1zdHJlYW1zXG4gKi9cbmV4cG9ydCBjbGFzcyBTdHJlYW1SZWFkZXIgZXh0ZW5kcyBBYnN0cmFjdFN0cmVhbVJlYWRlciB7XG4gICAgY29uc3RydWN0b3Iocykge1xuICAgICAgICBzdXBlcigpO1xuICAgICAgICB0aGlzLnMgPSBzO1xuICAgICAgICAvKipcbiAgICAgICAgICogRGVmZXJyZWQgdXNlZCBmb3IgcG9zdHBvbmVkIHJlYWQgcmVxdWVzdCAoYXMgbm90IGRhdGEgaXMgeWV0IGF2YWlsYWJsZSB0byByZWFkKVxuICAgICAgICAgKi9cbiAgICAgICAgdGhpcy5kZWZlcnJlZCA9IG51bGw7XG4gICAgICAgIGlmICghcy5yZWFkIHx8ICFzLm9uY2UpIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcignRXhwZWN0ZWQgYW4gaW5zdGFuY2Ugb2Ygc3RyZWFtLlJlYWRhYmxlJyk7XG4gICAgICAgIH1cbiAgICAgICAgdGhpcy5zLm9uY2UoJ2VuZCcsICgpID0+IHRoaXMucmVqZWN0KG5ldyBFbmRPZlN0cmVhbUVycm9yKCkpKTtcbiAgICAgICAgdGhpcy5zLm9uY2UoJ2Vycm9yJywgZXJyID0+IHRoaXMucmVqZWN0KGVycikpO1xuICAgICAgICB0aGlzLnMub25jZSgnY2xvc2UnLCAoKSA9PiB0aGlzLnJlamVjdChuZXcgRXJyb3IoJ1N0cmVhbSBjbG9zZWQnKSkpO1xuICAgIH1cbiAgICAvKipcbiAgICAgKiBSZWFkIGNodW5rIGZyb20gc3RyZWFtXG4gICAgICogQHBhcmFtIGJ1ZmZlciBUYXJnZXQgVWludDhBcnJheSAob3IgQnVmZmVyKSB0byBzdG9yZSBkYXRhIHJlYWQgZnJvbSBzdHJlYW0gaW5cbiAgICAgKiBAcGFyYW0gb2Zmc2V0IE9mZnNldCB0YXJnZXRcbiAgICAgKiBAcGFyYW0gbGVuZ3RoIE51bWJlciBvZiBieXRlcyB0byByZWFkXG4gICAgICogQHJldHVybnMgTnVtYmVyIG9mIGJ5dGVzIHJlYWRcbiAgICAgKi9cbiAgICBhc3luYyByZWFkRnJvbVN0cmVhbShidWZmZXIsIG9mZnNldCwgbGVuZ3RoKSB7XG4gICAgICAgIGlmICh0aGlzLmVuZE9mU3RyZWFtKSB7XG4gICAgICAgICAgICByZXR1cm4gMDtcbiAgICAgICAgfVxuICAgICAgICBjb25zdCByZWFkQnVmZmVyID0gdGhpcy5zLnJlYWQobGVuZ3RoKTtcbiAgICAgICAgaWYgKHJlYWRCdWZmZXIpIHtcbiAgICAgICAgICAgIGJ1ZmZlci5zZXQocmVhZEJ1ZmZlciwgb2Zmc2V0KTtcbiAgICAgICAgICAgIHJldHVybiByZWFkQnVmZmVyLmxlbmd0aDtcbiAgICAgICAgfVxuICAgICAgICBjb25zdCByZXF1ZXN0ID0ge1xuICAgICAgICAgICAgYnVmZmVyLFxuICAgICAgICAgICAgb2Zmc2V0LFxuICAgICAgICAgICAgbGVuZ3RoLFxuICAgICAgICAgICAgZGVmZXJyZWQ6IG5ldyBEZWZlcnJlZCgpXG4gICAgICAgIH07XG4gICAgICAgIHRoaXMuZGVmZXJyZWQgPSByZXF1ZXN0LmRlZmVycmVkO1xuICAgICAgICB0aGlzLnMub25jZSgncmVhZGFibGUnLCAoKSA9PiB7XG4gICAgICAgICAgICB0aGlzLnJlYWREZWZlcnJlZChyZXF1ZXN0KTtcbiAgICAgICAgfSk7XG4gICAgICAgIHJldHVybiByZXF1ZXN0LmRlZmVycmVkLnByb21pc2U7XG4gICAgfVxuICAgIC8qKlxuICAgICAqIFByb2Nlc3MgZGVmZXJyZWQgcmVhZCByZXF1ZXN0XG4gICAgICogQHBhcmFtIHJlcXVlc3QgRGVmZXJyZWQgcmVhZCByZXF1ZXN0XG4gICAgICovXG4gICAgcmVhZERlZmVycmVkKHJlcXVlc3QpIHtcbiAgICAgICAgY29uc3QgcmVhZEJ1ZmZlciA9IHRoaXMucy5yZWFkKHJlcXVlc3QubGVuZ3RoKTtcbiAgICAgICAgaWYgKHJlYWRCdWZmZXIpIHtcbiAgICAgICAgICAgIHJlcXVlc3QuYnVmZmVyLnNldChyZWFkQnVmZmVyLCByZXF1ZXN0Lm9mZnNldCk7XG4gICAgICAgICAgICByZXF1ZXN0LmRlZmVycmVkLnJlc29sdmUocmVhZEJ1ZmZlci5sZW5ndGgpO1xuICAgICAgICAgICAgdGhpcy5kZWZlcnJlZCA9IG51bGw7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICB0aGlzLnMub25jZSgncmVhZGFibGUnLCAoKSA9PiB7XG4gICAgICAgICAgICAgICAgdGhpcy5yZWFkRGVmZXJyZWQocmVxdWVzdCk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfVxuICAgIH1cbiAgICByZWplY3QoZXJyKSB7XG4gICAgICAgIHRoaXMuZW5kT2ZTdHJlYW0gPSB0cnVlO1xuICAgICAgICBpZiAodGhpcy5kZWZlcnJlZCkge1xuICAgICAgICAgICAgdGhpcy5kZWZlcnJlZC5yZWplY3QoZXJyKTtcbiAgICAgICAgICAgIHRoaXMuZGVmZXJyZWQgPSBudWxsO1xuICAgICAgICB9XG4gICAgfVxuICAgIGFzeW5jIGFib3J0KCkge1xuICAgICAgICB0aGlzLnMuZGVzdHJveSgpO1xuICAgIH1cbn1cbiIsImltcG9ydCB7IEVuZE9mU3RyZWFtRXJyb3IgfSBmcm9tICdwZWVrLXJlYWRhYmxlJztcbi8qKlxuICogQ29yZSB0b2tlbml6ZXJcbiAqL1xuZXhwb3J0IGNsYXNzIEFic3RyYWN0VG9rZW5pemVyIHtcbiAgICBjb25zdHJ1Y3RvcihmaWxlSW5mbykge1xuICAgICAgICAvKipcbiAgICAgICAgICogVG9rZW5pemVyLXN0cmVhbSBwb3NpdGlvblxuICAgICAgICAgKi9cbiAgICAgICAgdGhpcy5wb3NpdGlvbiA9IDA7XG4gICAgICAgIHRoaXMubnVtQnVmZmVyID0gbmV3IFVpbnQ4QXJyYXkoOCk7XG4gICAgICAgIHRoaXMuZmlsZUluZm8gPSBmaWxlSW5mbyA/IGZpbGVJbmZvIDoge307XG4gICAgfVxuICAgIC8qKlxuICAgICAqIFJlYWQgYSB0b2tlbiBmcm9tIHRoZSB0b2tlbml6ZXItc3RyZWFtXG4gICAgICogQHBhcmFtIHRva2VuIC0gVGhlIHRva2VuIHRvIHJlYWRcbiAgICAgKiBAcGFyYW0gcG9zaXRpb24gLSBJZiBwcm92aWRlZCwgdGhlIGRlc2lyZWQgcG9zaXRpb24gaW4gdGhlIHRva2VuaXplci1zdHJlYW1cbiAgICAgKiBAcmV0dXJucyBQcm9taXNlIHdpdGggdG9rZW4gZGF0YVxuICAgICAqL1xuICAgIGFzeW5jIHJlYWRUb2tlbih0b2tlbiwgcG9zaXRpb24gPSB0aGlzLnBvc2l0aW9uKSB7XG4gICAgICAgIGNvbnN0IHVpbnQ4QXJyYXkgPSBuZXcgVWludDhBcnJheSh0b2tlbi5sZW4pO1xuICAgICAgICBjb25zdCBsZW4gPSBhd2FpdCB0aGlzLnJlYWRCdWZmZXIodWludDhBcnJheSwgeyBwb3NpdGlvbiB9KTtcbiAgICAgICAgaWYgKGxlbiA8IHRva2VuLmxlbilcbiAgICAgICAgICAgIHRocm93IG5ldyBFbmRPZlN0cmVhbUVycm9yKCk7XG4gICAgICAgIHJldHVybiB0b2tlbi5nZXQodWludDhBcnJheSwgMCk7XG4gICAgfVxuICAgIC8qKlxuICAgICAqIFBlZWsgYSB0b2tlbiBmcm9tIHRoZSB0b2tlbml6ZXItc3RyZWFtLlxuICAgICAqIEBwYXJhbSB0b2tlbiAtIFRva2VuIHRvIHBlZWsgZnJvbSB0aGUgdG9rZW5pemVyLXN0cmVhbS5cbiAgICAgKiBAcGFyYW0gcG9zaXRpb24gLSBPZmZzZXQgd2hlcmUgdG8gYmVnaW4gcmVhZGluZyB3aXRoaW4gdGhlIGZpbGUuIElmIHBvc2l0aW9uIGlzIG51bGwsIGRhdGEgd2lsbCBiZSByZWFkIGZyb20gdGhlIGN1cnJlbnQgZmlsZSBwb3NpdGlvbi5cbiAgICAgKiBAcmV0dXJucyBQcm9taXNlIHdpdGggdG9rZW4gZGF0YVxuICAgICAqL1xuICAgIGFzeW5jIHBlZWtUb2tlbih0b2tlbiwgcG9zaXRpb24gPSB0aGlzLnBvc2l0aW9uKSB7XG4gICAgICAgIGNvbnN0IHVpbnQ4QXJyYXkgPSBuZXcgVWludDhBcnJheSh0b2tlbi5sZW4pO1xuICAgICAgICBjb25zdCBsZW4gPSBhd2FpdCB0aGlzLnBlZWtCdWZmZXIodWludDhBcnJheSwgeyBwb3NpdGlvbiB9KTtcbiAgICAgICAgaWYgKGxlbiA8IHRva2VuLmxlbilcbiAgICAgICAgICAgIHRocm93IG5ldyBFbmRPZlN0cmVhbUVycm9yKCk7XG4gICAgICAgIHJldHVybiB0b2tlbi5nZXQodWludDhBcnJheSwgMCk7XG4gICAgfVxuICAgIC8qKlxuICAgICAqIFJlYWQgYSBudW1lcmljIHRva2VuIGZyb20gdGhlIHN0cmVhbVxuICAgICAqIEBwYXJhbSB0b2tlbiAtIE51bWVyaWMgdG9rZW5cbiAgICAgKiBAcmV0dXJucyBQcm9taXNlIHdpdGggbnVtYmVyXG4gICAgICovXG4gICAgYXN5bmMgcmVhZE51bWJlcih0b2tlbikge1xuICAgICAgICBjb25zdCBsZW4gPSBhd2FpdCB0aGlzLnJlYWRCdWZmZXIodGhpcy5udW1CdWZmZXIsIHsgbGVuZ3RoOiB0b2tlbi5sZW4gfSk7XG4gICAgICAgIGlmIChsZW4gPCB0b2tlbi5sZW4pXG4gICAgICAgICAgICB0aHJvdyBuZXcgRW5kT2ZTdHJlYW1FcnJvcigpO1xuICAgICAgICByZXR1cm4gdG9rZW4uZ2V0KHRoaXMubnVtQnVmZmVyLCAwKTtcbiAgICB9XG4gICAgLyoqXG4gICAgICogUmVhZCBhIG51bWVyaWMgdG9rZW4gZnJvbSB0aGUgc3RyZWFtXG4gICAgICogQHBhcmFtIHRva2VuIC0gTnVtZXJpYyB0b2tlblxuICAgICAqIEByZXR1cm5zIFByb21pc2Ugd2l0aCBudW1iZXJcbiAgICAgKi9cbiAgICBhc3luYyBwZWVrTnVtYmVyKHRva2VuKSB7XG4gICAgICAgIGNvbnN0IGxlbiA9IGF3YWl0IHRoaXMucGVla0J1ZmZlcih0aGlzLm51bUJ1ZmZlciwgeyBsZW5ndGg6IHRva2VuLmxlbiB9KTtcbiAgICAgICAgaWYgKGxlbiA8IHRva2VuLmxlbilcbiAgICAgICAgICAgIHRocm93IG5ldyBFbmRPZlN0cmVhbUVycm9yKCk7XG4gICAgICAgIHJldHVybiB0b2tlbi5nZXQodGhpcy5udW1CdWZmZXIsIDApO1xuICAgIH1cbiAgICAvKipcbiAgICAgKiBJZ25vcmUgbnVtYmVyIG9mIGJ5dGVzLCBhZHZhbmNlcyB0aGUgcG9pbnRlciBpbiB1bmRlciB0b2tlbml6ZXItc3RyZWFtLlxuICAgICAqIEBwYXJhbSBsZW5ndGggLSBOdW1iZXIgb2YgYnl0ZXMgdG8gaWdub3JlXG4gICAgICogQHJldHVybiByZXNvbHZlcyB0aGUgbnVtYmVyIG9mIGJ5dGVzIGlnbm9yZWQsIGVxdWFscyBsZW5ndGggaWYgdGhpcyBhdmFpbGFibGUsIG90aGVyd2lzZSB0aGUgbnVtYmVyIG9mIGJ5dGVzIGF2YWlsYWJsZVxuICAgICAqL1xuICAgIGFzeW5jIGlnbm9yZShsZW5ndGgpIHtcbiAgICAgICAgaWYgKHRoaXMuZmlsZUluZm8uc2l6ZSAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICBjb25zdCBieXRlc0xlZnQgPSB0aGlzLmZpbGVJbmZvLnNpemUgLSB0aGlzLnBvc2l0aW9uO1xuICAgICAgICAgICAgaWYgKGxlbmd0aCA+IGJ5dGVzTGVmdCkge1xuICAgICAgICAgICAgICAgIHRoaXMucG9zaXRpb24gKz0gYnl0ZXNMZWZ0O1xuICAgICAgICAgICAgICAgIHJldHVybiBieXRlc0xlZnQ7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgdGhpcy5wb3NpdGlvbiArPSBsZW5ndGg7XG4gICAgICAgIHJldHVybiBsZW5ndGg7XG4gICAgfVxuICAgIGFzeW5jIGNsb3NlKCkge1xuICAgICAgICAvLyBlbXB0eVxuICAgIH1cbiAgICBub3JtYWxpemVPcHRpb25zKHVpbnQ4QXJyYXksIG9wdGlvbnMpIHtcbiAgICAgICAgaWYgKG9wdGlvbnMgJiYgb3B0aW9ucy5wb3NpdGlvbiAhPT0gdW5kZWZpbmVkICYmIG9wdGlvbnMucG9zaXRpb24gPCB0aGlzLnBvc2l0aW9uKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ2BvcHRpb25zLnBvc2l0aW9uYCBtdXN0IGJlIGVxdWFsIG9yIGdyZWF0ZXIgdGhhbiBgdG9rZW5pemVyLnBvc2l0aW9uYCcpO1xuICAgICAgICB9XG4gICAgICAgIGlmIChvcHRpb25zKSB7XG4gICAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgICAgIG1heUJlTGVzczogb3B0aW9ucy5tYXlCZUxlc3MgPT09IHRydWUsXG4gICAgICAgICAgICAgICAgb2Zmc2V0OiBvcHRpb25zLm9mZnNldCA/IG9wdGlvbnMub2Zmc2V0IDogMCxcbiAgICAgICAgICAgICAgICBsZW5ndGg6IG9wdGlvbnMubGVuZ3RoID8gb3B0aW9ucy5sZW5ndGggOiAodWludDhBcnJheS5sZW5ndGggLSAob3B0aW9ucy5vZmZzZXQgPyBvcHRpb25zLm9mZnNldCA6IDApKSxcbiAgICAgICAgICAgICAgICBwb3NpdGlvbjogb3B0aW9ucy5wb3NpdGlvbiA/IG9wdGlvbnMucG9zaXRpb24gOiB0aGlzLnBvc2l0aW9uXG4gICAgICAgICAgICB9O1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICBtYXlCZUxlc3M6IGZhbHNlLFxuICAgICAgICAgICAgb2Zmc2V0OiAwLFxuICAgICAgICAgICAgbGVuZ3RoOiB1aW50OEFycmF5Lmxlbmd0aCxcbiAgICAgICAgICAgIHBvc2l0aW9uOiB0aGlzLnBvc2l0aW9uXG4gICAgICAgIH07XG4gICAgfVxufVxuIiwiaW1wb3J0IHsgQWJzdHJhY3RUb2tlbml6ZXIgfSBmcm9tICcuL0Fic3RyYWN0VG9rZW5pemVyLmpzJztcbmltcG9ydCB7IEVuZE9mU3RyZWFtRXJyb3IgfSBmcm9tICdwZWVrLXJlYWRhYmxlJztcbmNvbnN0IG1heEJ1ZmZlclNpemUgPSAyNTYwMDA7XG5leHBvcnQgY2xhc3MgUmVhZFN0cmVhbVRva2VuaXplciBleHRlbmRzIEFic3RyYWN0VG9rZW5pemVyIHtcbiAgICBjb25zdHJ1Y3RvcihzdHJlYW1SZWFkZXIsIGZpbGVJbmZvKSB7XG4gICAgICAgIHN1cGVyKGZpbGVJbmZvKTtcbiAgICAgICAgdGhpcy5zdHJlYW1SZWFkZXIgPSBzdHJlYW1SZWFkZXI7XG4gICAgfVxuICAgIC8qKlxuICAgICAqIEdldCBmaWxlIGluZm9ybWF0aW9uLCBhbiBIVFRQLWNsaWVudCBtYXkgaW1wbGVtZW50IHRoaXMgZG9pbmcgYSBIRUFEIHJlcXVlc3RcbiAgICAgKiBAcmV0dXJuIFByb21pc2Ugd2l0aCBmaWxlIGluZm9ybWF0aW9uXG4gICAgICovXG4gICAgYXN5bmMgZ2V0RmlsZUluZm8oKSB7XG4gICAgICAgIHJldHVybiB0aGlzLmZpbGVJbmZvO1xuICAgIH1cbiAgICAvKipcbiAgICAgKiBSZWFkIGJ1ZmZlciBmcm9tIHRva2VuaXplclxuICAgICAqIEBwYXJhbSB1aW50OEFycmF5IC0gVGFyZ2V0IFVpbnQ4QXJyYXkgdG8gZmlsbCB3aXRoIGRhdGEgcmVhZCBmcm9tIHRoZSB0b2tlbml6ZXItc3RyZWFtXG4gICAgICogQHBhcmFtIG9wdGlvbnMgLSBSZWFkIGJlaGF2aW91ciBvcHRpb25zXG4gICAgICogQHJldHVybnMgUHJvbWlzZSB3aXRoIG51bWJlciBvZiBieXRlcyByZWFkXG4gICAgICovXG4gICAgYXN5bmMgcmVhZEJ1ZmZlcih1aW50OEFycmF5LCBvcHRpb25zKSB7XG4gICAgICAgIGNvbnN0IG5vcm1PcHRpb25zID0gdGhpcy5ub3JtYWxpemVPcHRpb25zKHVpbnQ4QXJyYXksIG9wdGlvbnMpO1xuICAgICAgICBjb25zdCBza2lwQnl0ZXMgPSBub3JtT3B0aW9ucy5wb3NpdGlvbiAtIHRoaXMucG9zaXRpb247XG4gICAgICAgIGlmIChza2lwQnl0ZXMgPiAwKSB7XG4gICAgICAgICAgICBhd2FpdCB0aGlzLmlnbm9yZShza2lwQnl0ZXMpO1xuICAgICAgICAgICAgcmV0dXJuIHRoaXMucmVhZEJ1ZmZlcih1aW50OEFycmF5LCBvcHRpb25zKTtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIGlmIChza2lwQnl0ZXMgPCAwKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ2BvcHRpb25zLnBvc2l0aW9uYCBtdXN0IGJlIGVxdWFsIG9yIGdyZWF0ZXIgdGhhbiBgdG9rZW5pemVyLnBvc2l0aW9uYCcpO1xuICAgICAgICB9XG4gICAgICAgIGlmIChub3JtT3B0aW9ucy5sZW5ndGggPT09IDApIHtcbiAgICAgICAgICAgIHJldHVybiAwO1xuICAgICAgICB9XG4gICAgICAgIGNvbnN0IGJ5dGVzUmVhZCA9IGF3YWl0IHRoaXMuc3RyZWFtUmVhZGVyLnJlYWQodWludDhBcnJheSwgbm9ybU9wdGlvbnMub2Zmc2V0LCBub3JtT3B0aW9ucy5sZW5ndGgpO1xuICAgICAgICB0aGlzLnBvc2l0aW9uICs9IGJ5dGVzUmVhZDtcbiAgICAgICAgaWYgKCghb3B0aW9ucyB8fCAhb3B0aW9ucy5tYXlCZUxlc3MpICYmIGJ5dGVzUmVhZCA8IG5vcm1PcHRpb25zLmxlbmd0aCkge1xuICAgICAgICAgICAgdGhyb3cgbmV3IEVuZE9mU3RyZWFtRXJyb3IoKTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gYnl0ZXNSZWFkO1xuICAgIH1cbiAgICAvKipcbiAgICAgKiBQZWVrIChyZWFkIGFoZWFkKSBidWZmZXIgZnJvbSB0b2tlbml6ZXJcbiAgICAgKiBAcGFyYW0gdWludDhBcnJheSAtIFVpbnQ4QXJyYXkgKG9yIEJ1ZmZlcikgdG8gd3JpdGUgZGF0YSB0b1xuICAgICAqIEBwYXJhbSBvcHRpb25zIC0gUmVhZCBiZWhhdmlvdXIgb3B0aW9uc1xuICAgICAqIEByZXR1cm5zIFByb21pc2Ugd2l0aCBudW1iZXIgb2YgYnl0ZXMgcGVla2VkXG4gICAgICovXG4gICAgYXN5bmMgcGVla0J1ZmZlcih1aW50OEFycmF5LCBvcHRpb25zKSB7XG4gICAgICAgIGNvbnN0IG5vcm1PcHRpb25zID0gdGhpcy5ub3JtYWxpemVPcHRpb25zKHVpbnQ4QXJyYXksIG9wdGlvbnMpO1xuICAgICAgICBsZXQgYnl0ZXNSZWFkID0gMDtcbiAgICAgICAgaWYgKG5vcm1PcHRpb25zLnBvc2l0aW9uKSB7XG4gICAgICAgICAgICBjb25zdCBza2lwQnl0ZXMgPSBub3JtT3B0aW9ucy5wb3NpdGlvbiAtIHRoaXMucG9zaXRpb247XG4gICAgICAgICAgICBpZiAoc2tpcEJ5dGVzID4gMCkge1xuICAgICAgICAgICAgICAgIGNvbnN0IHNraXBCdWZmZXIgPSBuZXcgVWludDhBcnJheShub3JtT3B0aW9ucy5sZW5ndGggKyBza2lwQnl0ZXMpO1xuICAgICAgICAgICAgICAgIGJ5dGVzUmVhZCA9IGF3YWl0IHRoaXMucGVla0J1ZmZlcihza2lwQnVmZmVyLCB7IG1heUJlTGVzczogbm9ybU9wdGlvbnMubWF5QmVMZXNzIH0pO1xuICAgICAgICAgICAgICAgIHVpbnQ4QXJyYXkuc2V0KHNraXBCdWZmZXIuc3ViYXJyYXkoc2tpcEJ5dGVzKSwgbm9ybU9wdGlvbnMub2Zmc2V0KTtcbiAgICAgICAgICAgICAgICByZXR1cm4gYnl0ZXNSZWFkIC0gc2tpcEJ5dGVzO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZSBpZiAoc2tpcEJ5dGVzIDwgMCkge1xuICAgICAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcignQ2Fubm90IHBlZWsgZnJvbSBhIG5lZ2F0aXZlIG9mZnNldCBpbiBhIHN0cmVhbScpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIGlmIChub3JtT3B0aW9ucy5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgIGJ5dGVzUmVhZCA9IGF3YWl0IHRoaXMuc3RyZWFtUmVhZGVyLnBlZWsodWludDhBcnJheSwgbm9ybU9wdGlvbnMub2Zmc2V0LCBub3JtT3B0aW9ucy5sZW5ndGgpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgY2F0Y2ggKGVycikge1xuICAgICAgICAgICAgICAgIGlmIChvcHRpb25zICYmIG9wdGlvbnMubWF5QmVMZXNzICYmIGVyciBpbnN0YW5jZW9mIEVuZE9mU3RyZWFtRXJyb3IpIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIDA7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIHRocm93IGVycjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmICgoIW5vcm1PcHRpb25zLm1heUJlTGVzcykgJiYgYnl0ZXNSZWFkIDwgbm9ybU9wdGlvbnMubGVuZ3RoKSB7XG4gICAgICAgICAgICAgICAgdGhyb3cgbmV3IEVuZE9mU3RyZWFtRXJyb3IoKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gYnl0ZXNSZWFkO1xuICAgIH1cbiAgICBhc3luYyBpZ25vcmUobGVuZ3RoKSB7XG4gICAgICAgIC8vIGRlYnVnKGBpZ25vcmUgJHt0aGlzLnBvc2l0aW9ufS4uLiR7dGhpcy5wb3NpdGlvbiArIGxlbmd0aCAtIDF9YCk7XG4gICAgICAgIGNvbnN0IGJ1ZlNpemUgPSBNYXRoLm1pbihtYXhCdWZmZXJTaXplLCBsZW5ndGgpO1xuICAgICAgICBjb25zdCBidWYgPSBuZXcgVWludDhBcnJheShidWZTaXplKTtcbiAgICAgICAgbGV0IHRvdEJ5dGVzUmVhZCA9IDA7XG4gICAgICAgIHdoaWxlICh0b3RCeXRlc1JlYWQgPCBsZW5ndGgpIHtcbiAgICAgICAgICAgIGNvbnN0IHJlbWFpbmluZyA9IGxlbmd0aCAtIHRvdEJ5dGVzUmVhZDtcbiAgICAgICAgICAgIGNvbnN0IGJ5dGVzUmVhZCA9IGF3YWl0IHRoaXMucmVhZEJ1ZmZlcihidWYsIHsgbGVuZ3RoOiBNYXRoLm1pbihidWZTaXplLCByZW1haW5pbmcpIH0pO1xuICAgICAgICAgICAgaWYgKGJ5dGVzUmVhZCA8IDApIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gYnl0ZXNSZWFkO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgdG90Qnl0ZXNSZWFkICs9IGJ5dGVzUmVhZDtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gdG90Qnl0ZXNSZWFkO1xuICAgIH1cbn1cbiIsImltcG9ydCB7IEVuZE9mU3RyZWFtRXJyb3IgfSBmcm9tICdwZWVrLXJlYWRhYmxlJztcbmltcG9ydCB7IEFic3RyYWN0VG9rZW5pemVyIH0gZnJvbSAnLi9BYnN0cmFjdFRva2VuaXplci5qcyc7XG5leHBvcnQgY2xhc3MgQnVmZmVyVG9rZW5pemVyIGV4dGVuZHMgQWJzdHJhY3RUb2tlbml6ZXIge1xuICAgIC8qKlxuICAgICAqIENvbnN0cnVjdCBCdWZmZXJUb2tlbml6ZXJcbiAgICAgKiBAcGFyYW0gdWludDhBcnJheSAtIFVpbnQ4QXJyYXkgdG8gdG9rZW5pemVcbiAgICAgKiBAcGFyYW0gZmlsZUluZm8gLSBQYXNzIGFkZGl0aW9uYWwgZmlsZSBpbmZvcm1hdGlvbiB0byB0aGUgdG9rZW5pemVyXG4gICAgICovXG4gICAgY29uc3RydWN0b3IodWludDhBcnJheSwgZmlsZUluZm8pIHtcbiAgICAgICAgc3VwZXIoZmlsZUluZm8pO1xuICAgICAgICB0aGlzLnVpbnQ4QXJyYXkgPSB1aW50OEFycmF5O1xuICAgICAgICB0aGlzLmZpbGVJbmZvLnNpemUgPSB0aGlzLmZpbGVJbmZvLnNpemUgPyB0aGlzLmZpbGVJbmZvLnNpemUgOiB1aW50OEFycmF5Lmxlbmd0aDtcbiAgICB9XG4gICAgLyoqXG4gICAgICogUmVhZCBidWZmZXIgZnJvbSB0b2tlbml6ZXJcbiAgICAgKiBAcGFyYW0gdWludDhBcnJheSAtIFVpbnQ4QXJyYXkgdG8gdG9rZW5pemVcbiAgICAgKiBAcGFyYW0gb3B0aW9ucyAtIFJlYWQgYmVoYXZpb3VyIG9wdGlvbnNcbiAgICAgKiBAcmV0dXJucyB7UHJvbWlzZTxudW1iZXI+fVxuICAgICAqL1xuICAgIGFzeW5jIHJlYWRCdWZmZXIodWludDhBcnJheSwgb3B0aW9ucykge1xuICAgICAgICBpZiAob3B0aW9ucyAmJiBvcHRpb25zLnBvc2l0aW9uKSB7XG4gICAgICAgICAgICBpZiAob3B0aW9ucy5wb3NpdGlvbiA8IHRoaXMucG9zaXRpb24pIHtcbiAgICAgICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ2BvcHRpb25zLnBvc2l0aW9uYCBtdXN0IGJlIGVxdWFsIG9yIGdyZWF0ZXIgdGhhbiBgdG9rZW5pemVyLnBvc2l0aW9uYCcpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgdGhpcy5wb3NpdGlvbiA9IG9wdGlvbnMucG9zaXRpb247XG4gICAgICAgIH1cbiAgICAgICAgY29uc3QgYnl0ZXNSZWFkID0gYXdhaXQgdGhpcy5wZWVrQnVmZmVyKHVpbnQ4QXJyYXksIG9wdGlvbnMpO1xuICAgICAgICB0aGlzLnBvc2l0aW9uICs9IGJ5dGVzUmVhZDtcbiAgICAgICAgcmV0dXJuIGJ5dGVzUmVhZDtcbiAgICB9XG4gICAgLyoqXG4gICAgICogUGVlayAocmVhZCBhaGVhZCkgYnVmZmVyIGZyb20gdG9rZW5pemVyXG4gICAgICogQHBhcmFtIHVpbnQ4QXJyYXlcbiAgICAgKiBAcGFyYW0gb3B0aW9ucyAtIFJlYWQgYmVoYXZpb3VyIG9wdGlvbnNcbiAgICAgKiBAcmV0dXJucyB7UHJvbWlzZTxudW1iZXI+fVxuICAgICAqL1xuICAgIGFzeW5jIHBlZWtCdWZmZXIodWludDhBcnJheSwgb3B0aW9ucykge1xuICAgICAgICBjb25zdCBub3JtT3B0aW9ucyA9IHRoaXMubm9ybWFsaXplT3B0aW9ucyh1aW50OEFycmF5LCBvcHRpb25zKTtcbiAgICAgICAgY29uc3QgYnl0ZXMycmVhZCA9IE1hdGgubWluKHRoaXMudWludDhBcnJheS5sZW5ndGggLSBub3JtT3B0aW9ucy5wb3NpdGlvbiwgbm9ybU9wdGlvbnMubGVuZ3RoKTtcbiAgICAgICAgaWYgKCghbm9ybU9wdGlvbnMubWF5QmVMZXNzKSAmJiBieXRlczJyZWFkIDwgbm9ybU9wdGlvbnMubGVuZ3RoKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgRW5kT2ZTdHJlYW1FcnJvcigpO1xuICAgICAgICB9XG4gICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgdWludDhBcnJheS5zZXQodGhpcy51aW50OEFycmF5LnN1YmFycmF5KG5vcm1PcHRpb25zLnBvc2l0aW9uLCBub3JtT3B0aW9ucy5wb3NpdGlvbiArIGJ5dGVzMnJlYWQpLCBub3JtT3B0aW9ucy5vZmZzZXQpO1xuICAgICAgICAgICAgcmV0dXJuIGJ5dGVzMnJlYWQ7XG4gICAgICAgIH1cbiAgICB9XG4gICAgYXN5bmMgY2xvc2UoKSB7XG4gICAgICAgIC8vIGVtcHR5XG4gICAgfVxufVxuIiwiaW1wb3J0IHsgUmVhZFN0cmVhbVRva2VuaXplciB9IGZyb20gJy4vUmVhZFN0cmVhbVRva2VuaXplci5qcyc7XG5pbXBvcnQgeyBCdWZmZXJUb2tlbml6ZXIgfSBmcm9tICcuL0J1ZmZlclRva2VuaXplci5qcyc7XG5pbXBvcnQgeyBTdHJlYW1SZWFkZXIsIFdlYlN0cmVhbVJlYWRlciB9IGZyb20gJ3BlZWstcmVhZGFibGUnO1xuZXhwb3J0IHsgRW5kT2ZTdHJlYW1FcnJvciB9IGZyb20gJ3BlZWstcmVhZGFibGUnO1xuLyoqXG4gKiBDb25zdHJ1Y3QgUmVhZFN0cmVhbVRva2VuaXplciBmcm9tIGdpdmVuIFN0cmVhbS5cbiAqIFdpbGwgc2V0IGZpbGVTaXplLCBpZiBwcm92aWRlZCBnaXZlbiBTdHJlYW0gaGFzIHNldCB0aGUgLnBhdGggcHJvcGVydHkvXG4gKiBAcGFyYW0gc3RyZWFtIC0gUmVhZCBmcm9tIE5vZGUuanMgU3RyZWFtLlJlYWRhYmxlXG4gKiBAcGFyYW0gZmlsZUluZm8gLSBQYXNzIHRoZSBmaWxlIGluZm9ybWF0aW9uLCBsaWtlIHNpemUgYW5kIE1JTUUtdHlwZSBvZiB0aGUgY29ycmVzcG9uZGluZyBzdHJlYW0uXG4gKiBAcmV0dXJucyBSZWFkU3RyZWFtVG9rZW5pemVyXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBmcm9tU3RyZWFtKHN0cmVhbSwgZmlsZUluZm8pIHtcbiAgICBmaWxlSW5mbyA9IGZpbGVJbmZvID8gZmlsZUluZm8gOiB7fTtcbiAgICByZXR1cm4gbmV3IFJlYWRTdHJlYW1Ub2tlbml6ZXIobmV3IFN0cmVhbVJlYWRlcihzdHJlYW0pLCBmaWxlSW5mbyk7XG59XG4vKipcbiAqIENvbnN0cnVjdCBSZWFkU3RyZWFtVG9rZW5pemVyIGZyb20gZ2l2ZW4gUmVhZGFibGVTdHJlYW0gKFdlYlN0cmVhbSBBUEkpLlxuICogV2lsbCBzZXQgZmlsZVNpemUsIGlmIHByb3ZpZGVkIGdpdmVuIFN0cmVhbSBoYXMgc2V0IHRoZSAucGF0aCBwcm9wZXJ0eS9cbiAqIEBwYXJhbSB3ZWJTdHJlYW0gLSBSZWFkIGZyb20gTm9kZS5qcyBTdHJlYW0uUmVhZGFibGVcbiAqIEBwYXJhbSBmaWxlSW5mbyAtIFBhc3MgdGhlIGZpbGUgaW5mb3JtYXRpb24sIGxpa2Ugc2l6ZSBhbmQgTUlNRS10eXBlIG9mIHRoZSBjb3JyZXNwb25kaW5nIHN0cmVhbS5cbiAqIEByZXR1cm5zIFJlYWRTdHJlYW1Ub2tlbml6ZXJcbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGZyb21XZWJTdHJlYW0od2ViU3RyZWFtLCBmaWxlSW5mbykge1xuICAgIGZpbGVJbmZvID0gZmlsZUluZm8gPyBmaWxlSW5mbyA6IHt9O1xuICAgIHJldHVybiBuZXcgUmVhZFN0cmVhbVRva2VuaXplcihuZXcgV2ViU3RyZWFtUmVhZGVyKHdlYlN0cmVhbSksIGZpbGVJbmZvKTtcbn1cbi8qKlxuICogQ29uc3RydWN0IFJlYWRTdHJlYW1Ub2tlbml6ZXIgZnJvbSBnaXZlbiBCdWZmZXIuXG4gKiBAcGFyYW0gdWludDhBcnJheSAtIFVpbnQ4QXJyYXkgdG8gdG9rZW5pemVcbiAqIEBwYXJhbSBmaWxlSW5mbyAtIFBhc3MgYWRkaXRpb25hbCBmaWxlIGluZm9ybWF0aW9uIHRvIHRoZSB0b2tlbml6ZXJcbiAqIEByZXR1cm5zIEJ1ZmZlclRva2VuaXplclxuICovXG5leHBvcnQgZnVuY3Rpb24gZnJvbUJ1ZmZlcih1aW50OEFycmF5LCBmaWxlSW5mbykge1xuICAgIHJldHVybiBuZXcgQnVmZmVyVG9rZW5pemVyKHVpbnQ4QXJyYXksIGZpbGVJbmZvKTtcbn1cbiIsImV4cG9ydCBmdW5jdGlvbiBzdHJpbmdUb0J5dGVzKHN0cmluZykge1xuXHRyZXR1cm4gWy4uLnN0cmluZ10ubWFwKGNoYXJhY3RlciA9PiBjaGFyYWN0ZXIuY2hhckNvZGVBdCgwKSk7IC8vIGVzbGludC1kaXNhYmxlLWxpbmUgdW5pY29ybi9wcmVmZXItY29kZS1wb2ludFxufVxuXG4vKipcbkNoZWNrcyB3aGV0aGVyIHRoZSBUQVIgY2hlY2tzdW0gaXMgdmFsaWQuXG5cbkBwYXJhbSB7QnVmZmVyfSBidWZmZXIgLSBUaGUgVEFSIGhlYWRlciBgW29mZnNldCAuLi4gb2Zmc2V0ICsgNTEyXWAuXG5AcGFyYW0ge251bWJlcn0gb2Zmc2V0IC0gVEFSIGhlYWRlciBvZmZzZXQuXG5AcmV0dXJucyB7Ym9vbGVhbn0gYHRydWVgIGlmIHRoZSBUQVIgY2hlY2tzdW0gaXMgdmFsaWQsIG90aGVyd2lzZSBgZmFsc2VgLlxuKi9cbmV4cG9ydCBmdW5jdGlvbiB0YXJIZWFkZXJDaGVja3N1bU1hdGNoZXMoYnVmZmVyLCBvZmZzZXQgPSAwKSB7XG5cdGNvbnN0IHJlYWRTdW0gPSBOdW1iZXIucGFyc2VJbnQoYnVmZmVyLnRvU3RyaW5nKCd1dGY4JywgMTQ4LCAxNTQpLnJlcGxhY2UoL1xcMC4qJC8sICcnKS50cmltKCksIDgpOyAvLyBSZWFkIHN1bSBpbiBoZWFkZXJcblx0aWYgKE51bWJlci5pc05hTihyZWFkU3VtKSkge1xuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXG5cdGxldCBzdW0gPSA4ICogMHgyMDsgLy8gSW5pdGlhbGl6ZSBzaWduZWQgYml0IHN1bVxuXG5cdGZvciAobGV0IGluZGV4ID0gb2Zmc2V0OyBpbmRleCA8IG9mZnNldCArIDE0ODsgaW5kZXgrKykge1xuXHRcdHN1bSArPSBidWZmZXJbaW5kZXhdO1xuXHR9XG5cblx0Zm9yIChsZXQgaW5kZXggPSBvZmZzZXQgKyAxNTY7IGluZGV4IDwgb2Zmc2V0ICsgNTEyOyBpbmRleCsrKSB7XG5cdFx0c3VtICs9IGJ1ZmZlcltpbmRleF07XG5cdH1cblxuXHRyZXR1cm4gcmVhZFN1bSA9PT0gc3VtO1xufVxuXG4vKipcbklEMyBVSU5UMzIgc3luYy1zYWZlIHRva2VuaXplciB0b2tlbi5cbjI4IGJpdHMgKHJlcHJlc2VudGluZyB1cCB0byAyNTZNQikgaW50ZWdlciwgdGhlIG1zYiBpcyAwIHRvIGF2b2lkIFwiZmFsc2Ugc3luY3NpZ25hbHNcIi5cbiovXG5leHBvcnQgY29uc3QgdWludDMyU3luY1NhZmVUb2tlbiA9IHtcblx0Z2V0OiAoYnVmZmVyLCBvZmZzZXQpID0+IChidWZmZXJbb2Zmc2V0ICsgM10gJiAweDdGKSB8ICgoYnVmZmVyW29mZnNldCArIDJdKSA8PCA3KSB8ICgoYnVmZmVyW29mZnNldCArIDFdKSA8PCAxNCkgfCAoKGJ1ZmZlcltvZmZzZXRdKSA8PCAyMSksXG5cdGxlbjogNCxcbn07XG4iLCJleHBvcnQgY29uc3QgZXh0ZW5zaW9ucyA9IFtcblx0J2pwZycsXG5cdCdwbmcnLFxuXHQnYXBuZycsXG5cdCdnaWYnLFxuXHQnd2VicCcsXG5cdCdmbGlmJyxcblx0J3hjZicsXG5cdCdjcjInLFxuXHQnY3IzJyxcblx0J29yZicsXG5cdCdhcncnLFxuXHQnZG5nJyxcblx0J25lZicsXG5cdCdydzInLFxuXHQncmFmJyxcblx0J3RpZicsXG5cdCdibXAnLFxuXHQnaWNucycsXG5cdCdqeHInLFxuXHQncHNkJyxcblx0J2luZGQnLFxuXHQnemlwJyxcblx0J3RhcicsXG5cdCdyYXInLFxuXHQnZ3onLFxuXHQnYnoyJyxcblx0Jzd6Jyxcblx0J2RtZycsXG5cdCdtcDQnLFxuXHQnbWlkJyxcblx0J21rdicsXG5cdCd3ZWJtJyxcblx0J21vdicsXG5cdCdhdmknLFxuXHQnbXBnJyxcblx0J21wMicsXG5cdCdtcDMnLFxuXHQnbTRhJyxcblx0J29nYScsXG5cdCdvZ2cnLFxuXHQnb2d2Jyxcblx0J29wdXMnLFxuXHQnZmxhYycsXG5cdCd3YXYnLFxuXHQnc3B4Jyxcblx0J2FtcicsXG5cdCdwZGYnLFxuXHQnZXB1YicsXG5cdCdlbGYnLFxuXHQnbWFjaG8nLFxuXHQnZXhlJyxcblx0J3N3ZicsXG5cdCdydGYnLFxuXHQnd2FzbScsXG5cdCd3b2ZmJyxcblx0J3dvZmYyJyxcblx0J2VvdCcsXG5cdCd0dGYnLFxuXHQnb3RmJyxcblx0J2ljbycsXG5cdCdmbHYnLFxuXHQncHMnLFxuXHQneHonLFxuXHQnc3FsaXRlJyxcblx0J25lcycsXG5cdCdjcngnLFxuXHQneHBpJyxcblx0J2NhYicsXG5cdCdkZWInLFxuXHQnYXInLFxuXHQncnBtJyxcblx0J1onLFxuXHQnbHonLFxuXHQnY2ZiJyxcblx0J214ZicsXG5cdCdtdHMnLFxuXHQnYmxlbmQnLFxuXHQnYnBnJyxcblx0J2RvY3gnLFxuXHQncHB0eCcsXG5cdCd4bHN4Jyxcblx0JzNncCcsXG5cdCczZzInLFxuXHQnajJjJyxcblx0J2pwMicsXG5cdCdqcG0nLFxuXHQnanB4Jyxcblx0J21qMicsXG5cdCdhaWYnLFxuXHQncWNwJyxcblx0J29kdCcsXG5cdCdvZHMnLFxuXHQnb2RwJyxcblx0J3htbCcsXG5cdCdtb2JpJyxcblx0J2hlaWMnLFxuXHQnY3VyJyxcblx0J2t0eCcsXG5cdCdhcGUnLFxuXHQnd3YnLFxuXHQnZGNtJyxcblx0J2ljcycsXG5cdCdnbGInLFxuXHQncGNhcCcsXG5cdCdkc2YnLFxuXHQnbG5rJyxcblx0J2FsaWFzJyxcblx0J3ZvYycsXG5cdCdhYzMnLFxuXHQnbTR2Jyxcblx0J200cCcsXG5cdCdtNGInLFxuXHQnZjR2Jyxcblx0J2Y0cCcsXG5cdCdmNGInLFxuXHQnZjRhJyxcblx0J21pZScsXG5cdCdhc2YnLFxuXHQnb2dtJyxcblx0J29neCcsXG5cdCdtcGMnLFxuXHQnYXJyb3cnLFxuXHQnc2hwJyxcblx0J2FhYycsXG5cdCdtcDEnLFxuXHQnaXQnLFxuXHQnczNtJyxcblx0J3htJyxcblx0J2FpJyxcblx0J3NrcCcsXG5cdCdhdmlmJyxcblx0J2VwcycsXG5cdCdsemgnLFxuXHQncGdwJyxcblx0J2FzYXInLFxuXHQnc3RsJyxcblx0J2NobScsXG5cdCczbWYnLFxuXHQnenN0Jyxcblx0J2p4bCcsXG5cdCd2Y2YnLFxuXHQnamxzJyxcblx0J3BzdCcsXG5cdCdkd2cnLFxuXHQncGFycXVldCcsXG5cdCdjbGFzcycsXG5cdCdhcmonLFxuXHQnY3BpbycsXG5cdCdhY2UnLFxuXHQnYXZybycsXG5cdCdpY2MnLFxuXHQnZmJ4Jyxcbl07XG5cbmV4cG9ydCBjb25zdCBtaW1lVHlwZXMgPSBbXG5cdCdpbWFnZS9qcGVnJyxcblx0J2ltYWdlL3BuZycsXG5cdCdpbWFnZS9naWYnLFxuXHQnaW1hZ2Uvd2VicCcsXG5cdCdpbWFnZS9mbGlmJyxcblx0J2ltYWdlL3gteGNmJyxcblx0J2ltYWdlL3gtY2Fub24tY3IyJyxcblx0J2ltYWdlL3gtY2Fub24tY3IzJyxcblx0J2ltYWdlL3RpZmYnLFxuXHQnaW1hZ2UvYm1wJyxcblx0J2ltYWdlL3ZuZC5tcy1waG90bycsXG5cdCdpbWFnZS92bmQuYWRvYmUucGhvdG9zaG9wJyxcblx0J2FwcGxpY2F0aW9uL3gtaW5kZXNpZ24nLFxuXHQnYXBwbGljYXRpb24vZXB1Yit6aXAnLFxuXHQnYXBwbGljYXRpb24veC14cGluc3RhbGwnLFxuXHQnYXBwbGljYXRpb24vdm5kLm9hc2lzLm9wZW5kb2N1bWVudC50ZXh0Jyxcblx0J2FwcGxpY2F0aW9uL3ZuZC5vYXNpcy5vcGVuZG9jdW1lbnQuc3ByZWFkc2hlZXQnLFxuXHQnYXBwbGljYXRpb24vdm5kLm9hc2lzLm9wZW5kb2N1bWVudC5wcmVzZW50YXRpb24nLFxuXHQnYXBwbGljYXRpb24vdm5kLm9wZW54bWxmb3JtYXRzLW9mZmljZWRvY3VtZW50LndvcmRwcm9jZXNzaW5nbWwuZG9jdW1lbnQnLFxuXHQnYXBwbGljYXRpb24vdm5kLm9wZW54bWxmb3JtYXRzLW9mZmljZWRvY3VtZW50LnByZXNlbnRhdGlvbm1sLnByZXNlbnRhdGlvbicsXG5cdCdhcHBsaWNhdGlvbi92bmQub3BlbnhtbGZvcm1hdHMtb2ZmaWNlZG9jdW1lbnQuc3ByZWFkc2hlZXRtbC5zaGVldCcsXG5cdCdhcHBsaWNhdGlvbi96aXAnLFxuXHQnYXBwbGljYXRpb24veC10YXInLFxuXHQnYXBwbGljYXRpb24veC1yYXItY29tcHJlc3NlZCcsXG5cdCdhcHBsaWNhdGlvbi9nemlwJyxcblx0J2FwcGxpY2F0aW9uL3gtYnppcDInLFxuXHQnYXBwbGljYXRpb24veC03ei1jb21wcmVzc2VkJyxcblx0J2FwcGxpY2F0aW9uL3gtYXBwbGUtZGlza2ltYWdlJyxcblx0J2FwcGxpY2F0aW9uL3gtYXBhY2hlLWFycm93Jyxcblx0J3ZpZGVvL21wNCcsXG5cdCdhdWRpby9taWRpJyxcblx0J3ZpZGVvL3gtbWF0cm9za2EnLFxuXHQndmlkZW8vd2VibScsXG5cdCd2aWRlby9xdWlja3RpbWUnLFxuXHQndmlkZW8vdm5kLmF2aScsXG5cdCdhdWRpby92bmQud2F2ZScsXG5cdCdhdWRpby9xY2VscCcsXG5cdCdhdWRpby94LW1zLWFzZicsXG5cdCd2aWRlby94LW1zLWFzZicsXG5cdCdhcHBsaWNhdGlvbi92bmQubXMtYXNmJyxcblx0J3ZpZGVvL21wZWcnLFxuXHQndmlkZW8vM2dwcCcsXG5cdCdhdWRpby9tcGVnJyxcblx0J2F1ZGlvL21wNCcsIC8vIFJGQyA0MzM3XG5cdCdhdWRpby9vcHVzJyxcblx0J3ZpZGVvL29nZycsXG5cdCdhdWRpby9vZ2cnLFxuXHQnYXBwbGljYXRpb24vb2dnJyxcblx0J2F1ZGlvL3gtZmxhYycsXG5cdCdhdWRpby9hcGUnLFxuXHQnYXVkaW8vd2F2cGFjaycsXG5cdCdhdWRpby9hbXInLFxuXHQnYXBwbGljYXRpb24vcGRmJyxcblx0J2FwcGxpY2F0aW9uL3gtZWxmJyxcblx0J2FwcGxpY2F0aW9uL3gtbWFjaC1iaW5hcnknLFxuXHQnYXBwbGljYXRpb24veC1tc2Rvd25sb2FkJyxcblx0J2FwcGxpY2F0aW9uL3gtc2hvY2t3YXZlLWZsYXNoJyxcblx0J2FwcGxpY2F0aW9uL3J0ZicsXG5cdCdhcHBsaWNhdGlvbi93YXNtJyxcblx0J2ZvbnQvd29mZicsXG5cdCdmb250L3dvZmYyJyxcblx0J2FwcGxpY2F0aW9uL3ZuZC5tcy1mb250b2JqZWN0Jyxcblx0J2ZvbnQvdHRmJyxcblx0J2ZvbnQvb3RmJyxcblx0J2ltYWdlL3gtaWNvbicsXG5cdCd2aWRlby94LWZsdicsXG5cdCdhcHBsaWNhdGlvbi9wb3N0c2NyaXB0Jyxcblx0J2FwcGxpY2F0aW9uL2VwcycsXG5cdCdhcHBsaWNhdGlvbi94LXh6Jyxcblx0J2FwcGxpY2F0aW9uL3gtc3FsaXRlMycsXG5cdCdhcHBsaWNhdGlvbi94LW5pbnRlbmRvLW5lcy1yb20nLFxuXHQnYXBwbGljYXRpb24veC1nb29nbGUtY2hyb21lLWV4dGVuc2lvbicsXG5cdCdhcHBsaWNhdGlvbi92bmQubXMtY2FiLWNvbXByZXNzZWQnLFxuXHQnYXBwbGljYXRpb24veC1kZWInLFxuXHQnYXBwbGljYXRpb24veC11bml4LWFyY2hpdmUnLFxuXHQnYXBwbGljYXRpb24veC1ycG0nLFxuXHQnYXBwbGljYXRpb24veC1jb21wcmVzcycsXG5cdCdhcHBsaWNhdGlvbi94LWx6aXAnLFxuXHQnYXBwbGljYXRpb24veC1jZmInLFxuXHQnYXBwbGljYXRpb24veC1taWUnLFxuXHQnYXBwbGljYXRpb24vbXhmJyxcblx0J3ZpZGVvL21wMnQnLFxuXHQnYXBwbGljYXRpb24veC1ibGVuZGVyJyxcblx0J2ltYWdlL2JwZycsXG5cdCdpbWFnZS9qMmMnLFxuXHQnaW1hZ2UvanAyJyxcblx0J2ltYWdlL2pweCcsXG5cdCdpbWFnZS9qcG0nLFxuXHQnaW1hZ2UvbWoyJyxcblx0J2F1ZGlvL2FpZmYnLFxuXHQnYXBwbGljYXRpb24veG1sJyxcblx0J2FwcGxpY2F0aW9uL3gtbW9iaXBvY2tldC1lYm9vaycsXG5cdCdpbWFnZS9oZWlmJyxcblx0J2ltYWdlL2hlaWYtc2VxdWVuY2UnLFxuXHQnaW1hZ2UvaGVpYycsXG5cdCdpbWFnZS9oZWljLXNlcXVlbmNlJyxcblx0J2ltYWdlL2ljbnMnLFxuXHQnaW1hZ2Uva3R4Jyxcblx0J2FwcGxpY2F0aW9uL2RpY29tJyxcblx0J2F1ZGlvL3gtbXVzZXBhY2snLFxuXHQndGV4dC9jYWxlbmRhcicsXG5cdCd0ZXh0L3ZjYXJkJyxcblx0J21vZGVsL2dsdGYtYmluYXJ5Jyxcblx0J2FwcGxpY2F0aW9uL3ZuZC50Y3BkdW1wLnBjYXAnLFxuXHQnYXVkaW8veC1kc2YnLCAvLyBOb24tc3RhbmRhcmRcblx0J2FwcGxpY2F0aW9uL3gubXMuc2hvcnRjdXQnLCAvLyBJbnZlbnRlZCBieSB1c1xuXHQnYXBwbGljYXRpb24veC5hcHBsZS5hbGlhcycsIC8vIEludmVudGVkIGJ5IHVzXG5cdCdhdWRpby94LXZvYycsXG5cdCdhdWRpby92bmQuZG9sYnkuZGQtcmF3Jyxcblx0J2F1ZGlvL3gtbTRhJyxcblx0J2ltYWdlL2FwbmcnLFxuXHQnaW1hZ2UveC1vbHltcHVzLW9yZicsXG5cdCdpbWFnZS94LXNvbnktYXJ3Jyxcblx0J2ltYWdlL3gtYWRvYmUtZG5nJyxcblx0J2ltYWdlL3gtbmlrb24tbmVmJyxcblx0J2ltYWdlL3gtcGFuYXNvbmljLXJ3MicsXG5cdCdpbWFnZS94LWZ1amlmaWxtLXJhZicsXG5cdCd2aWRlby94LW00dicsXG5cdCd2aWRlby8zZ3BwMicsXG5cdCdhcHBsaWNhdGlvbi94LWVzcmktc2hhcGUnLFxuXHQnYXVkaW8vYWFjJyxcblx0J2F1ZGlvL3gtaXQnLFxuXHQnYXVkaW8veC1zM20nLFxuXHQnYXVkaW8veC14bScsXG5cdCd2aWRlby9NUDFTJyxcblx0J3ZpZGVvL01QMlAnLFxuXHQnYXBwbGljYXRpb24vdm5kLnNrZXRjaHVwLnNrcCcsXG5cdCdpbWFnZS9hdmlmJyxcblx0J2FwcGxpY2F0aW9uL3gtbHpoLWNvbXByZXNzZWQnLFxuXHQnYXBwbGljYXRpb24vcGdwLWVuY3J5cHRlZCcsXG5cdCdhcHBsaWNhdGlvbi94LWFzYXInLFxuXHQnbW9kZWwvc3RsJyxcblx0J2FwcGxpY2F0aW9uL3ZuZC5tcy1odG1saGVscCcsXG5cdCdtb2RlbC8zbWYnLFxuXHQnaW1hZ2UvanhsJyxcblx0J2FwcGxpY2F0aW9uL3pzdGQnLFxuXHQnaW1hZ2UvamxzJyxcblx0J2FwcGxpY2F0aW9uL3ZuZC5tcy1vdXRsb29rJyxcblx0J2ltYWdlL3ZuZC5kd2cnLFxuXHQnYXBwbGljYXRpb24veC1wYXJxdWV0Jyxcblx0J2FwcGxpY2F0aW9uL2phdmEtdm0nLFxuXHQnYXBwbGljYXRpb24veC1hcmonLFxuXHQnYXBwbGljYXRpb24veC1jcGlvJyxcblx0J2FwcGxpY2F0aW9uL3gtYWNlLWNvbXByZXNzZWQnLFxuXHQnYXBwbGljYXRpb24vYXZybycsXG5cdCdhcHBsaWNhdGlvbi92bmQuaWNjcHJvZmlsZScsXG5cdCdhcHBsaWNhdGlvbi94LmF1dG9kZXNrLmZieCcsIC8vIEludmVudGVkIGJ5IHVzXG5dO1xuIiwiaW1wb3J0IHtCdWZmZXJ9IGZyb20gJ25vZGU6YnVmZmVyJztcbmltcG9ydCAqIGFzIFRva2VuIGZyb20gJ3Rva2VuLXR5cGVzJztcbmltcG9ydCAqIGFzIHN0cnRvazMgZnJvbSAnc3RydG9rMy9jb3JlJzsgLy8gZXNsaW50LWRpc2FibGUtbGluZSBuL2ZpbGUtZXh0ZW5zaW9uLWluLWltcG9ydFxuaW1wb3J0IHtcblx0c3RyaW5nVG9CeXRlcyxcblx0dGFySGVhZGVyQ2hlY2tzdW1NYXRjaGVzLFxuXHR1aW50MzJTeW5jU2FmZVRva2VuLFxufSBmcm9tICcuL3V0aWwuanMnO1xuaW1wb3J0IHtleHRlbnNpb25zLCBtaW1lVHlwZXN9IGZyb20gJy4vc3VwcG9ydGVkLmpzJztcblxuY29uc3QgbWluaW11bUJ5dGVzID0gNDEwMDsgLy8gQSBmYWlyIGFtb3VudCBvZiBmaWxlLXR5cGVzIGFyZSBkZXRlY3RhYmxlIHdpdGhpbiB0aGlzIHJhbmdlLlxuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gZmlsZVR5cGVGcm9tU3RyZWFtKHN0cmVhbSkge1xuXHRyZXR1cm4gbmV3IEZpbGVUeXBlUGFyc2VyKCkuZnJvbVN0cmVhbShzdHJlYW0pO1xufVxuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gZmlsZVR5cGVGcm9tQnVmZmVyKGlucHV0KSB7XG5cdHJldHVybiBuZXcgRmlsZVR5cGVQYXJzZXIoKS5mcm9tQnVmZmVyKGlucHV0KTtcbn1cblxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGZpbGVUeXBlRnJvbUJsb2IoYmxvYikge1xuXHRyZXR1cm4gbmV3IEZpbGVUeXBlUGFyc2VyKCkuZnJvbUJsb2IoYmxvYik7XG59XG5cbmZ1bmN0aW9uIF9jaGVjayhidWZmZXIsIGhlYWRlcnMsIG9wdGlvbnMpIHtcblx0b3B0aW9ucyA9IHtcblx0XHRvZmZzZXQ6IDAsXG5cdFx0Li4ub3B0aW9ucyxcblx0fTtcblxuXHRmb3IgKGNvbnN0IFtpbmRleCwgaGVhZGVyXSBvZiBoZWFkZXJzLmVudHJpZXMoKSkge1xuXHRcdC8vIElmIGEgYml0bWFzayBpcyBzZXRcblx0XHRpZiAob3B0aW9ucy5tYXNrKSB7XG5cdFx0XHQvLyBJZiBoZWFkZXIgZG9lc24ndCBlcXVhbCBgYnVmYCB3aXRoIGJpdHMgbWFza2VkIG9mZlxuXHRcdFx0aWYgKGhlYWRlciAhPT0gKG9wdGlvbnMubWFza1tpbmRleF0gJiBidWZmZXJbaW5kZXggKyBvcHRpb25zLm9mZnNldF0pKSB7XG5cdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdH1cblx0XHR9IGVsc2UgaWYgKGhlYWRlciAhPT0gYnVmZmVyW2luZGV4ICsgb3B0aW9ucy5vZmZzZXRdKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHR9XG5cblx0cmV0dXJuIHRydWU7XG59XG5cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBmaWxlVHlwZUZyb21Ub2tlbml6ZXIodG9rZW5pemVyKSB7XG5cdHJldHVybiBuZXcgRmlsZVR5cGVQYXJzZXIoKS5mcm9tVG9rZW5pemVyKHRva2VuaXplcik7XG59XG5cbmV4cG9ydCBjbGFzcyBGaWxlVHlwZVBhcnNlciB7XG5cdGNvbnN0cnVjdG9yKG9wdGlvbnMpIHtcblx0XHR0aGlzLmRldGVjdG9ycyA9IG9wdGlvbnM/LmN1c3RvbURldGVjdG9ycztcblxuXHRcdHRoaXMuZnJvbVRva2VuaXplciA9IHRoaXMuZnJvbVRva2VuaXplci5iaW5kKHRoaXMpO1xuXHRcdHRoaXMuZnJvbUJ1ZmZlciA9IHRoaXMuZnJvbUJ1ZmZlci5iaW5kKHRoaXMpO1xuXHRcdHRoaXMucGFyc2UgPSB0aGlzLnBhcnNlLmJpbmQodGhpcyk7XG5cdH1cblxuXHRhc3luYyBmcm9tVG9rZW5pemVyKHRva2VuaXplcikge1xuXHRcdGNvbnN0IGluaXRpYWxQb3NpdGlvbiA9IHRva2VuaXplci5wb3NpdGlvbjtcblxuXHRcdGZvciAoY29uc3QgZGV0ZWN0b3Igb2YgdGhpcy5kZXRlY3RvcnMgfHwgW10pIHtcblx0XHRcdGNvbnN0IGZpbGVUeXBlID0gYXdhaXQgZGV0ZWN0b3IodG9rZW5pemVyKTtcblx0XHRcdGlmIChmaWxlVHlwZSkge1xuXHRcdFx0XHRyZXR1cm4gZmlsZVR5cGU7XG5cdFx0XHR9XG5cblx0XHRcdGlmIChpbml0aWFsUG9zaXRpb24gIT09IHRva2VuaXplci5wb3NpdGlvbikge1xuXHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkOyAvLyBDYW5ub3QgcHJvY2VlZCBzY2FubmluZyBvZiB0aGUgdG9rZW5pemVyIGlzIGF0IGFuIGFyYml0cmFyeSBwb3NpdGlvblxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiB0aGlzLnBhcnNlKHRva2VuaXplcik7XG5cdH1cblxuXHRhc3luYyBmcm9tQnVmZmVyKGlucHV0KSB7XG5cdFx0aWYgKCEoaW5wdXQgaW5zdGFuY2VvZiBVaW50OEFycmF5IHx8IGlucHV0IGluc3RhbmNlb2YgQXJyYXlCdWZmZXIpKSB7XG5cdFx0XHR0aHJvdyBuZXcgVHlwZUVycm9yKGBFeHBlY3RlZCB0aGUgXFxgaW5wdXRcXGAgYXJndW1lbnQgdG8gYmUgb2YgdHlwZSBcXGBVaW50OEFycmF5XFxgIG9yIFxcYEJ1ZmZlclxcYCBvciBcXGBBcnJheUJ1ZmZlclxcYCwgZ290IFxcYCR7dHlwZW9mIGlucHV0fVxcYGApO1xuXHRcdH1cblxuXHRcdGNvbnN0IGJ1ZmZlciA9IGlucHV0IGluc3RhbmNlb2YgVWludDhBcnJheSA/IGlucHV0IDogbmV3IFVpbnQ4QXJyYXkoaW5wdXQpO1xuXG5cdFx0aWYgKCEoYnVmZmVyPy5sZW5ndGggPiAxKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHJldHVybiB0aGlzLmZyb21Ub2tlbml6ZXIoc3RydG9rMy5mcm9tQnVmZmVyKGJ1ZmZlcikpO1xuXHR9XG5cblx0YXN5bmMgZnJvbUJsb2IoYmxvYikge1xuXHRcdGNvbnN0IGJ1ZmZlciA9IGF3YWl0IGJsb2IuYXJyYXlCdWZmZXIoKTtcblx0XHRyZXR1cm4gdGhpcy5mcm9tQnVmZmVyKG5ldyBVaW50OEFycmF5KGJ1ZmZlcikpO1xuXHR9XG5cblx0YXN5bmMgZnJvbVN0cmVhbShzdHJlYW0pIHtcblx0XHRjb25zdCB0b2tlbml6ZXIgPSBhd2FpdCBzdHJ0b2szLmZyb21TdHJlYW0oc3RyZWFtKTtcblx0XHR0cnkge1xuXHRcdFx0cmV0dXJuIGF3YWl0IHRoaXMuZnJvbVRva2VuaXplcih0b2tlbml6ZXIpO1xuXHRcdH0gZmluYWxseSB7XG5cdFx0XHRhd2FpdCB0b2tlbml6ZXIuY2xvc2UoKTtcblx0XHR9XG5cdH1cblxuXHRhc3luYyB0b0RldGVjdGlvblN0cmVhbShyZWFkYWJsZVN0cmVhbSwgb3B0aW9ucyA9IHt9KSB7XG5cdFx0Y29uc3Qge2RlZmF1bHQ6IHN0cmVhbX0gPSBhd2FpdCBpbXBvcnQoJ25vZGU6c3RyZWFtJyk7XG5cdFx0Y29uc3Qge3NhbXBsZVNpemUgPSBtaW5pbXVtQnl0ZXN9ID0gb3B0aW9ucztcblxuXHRcdHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG5cdFx0XHRyZWFkYWJsZVN0cmVhbS5vbignZXJyb3InLCByZWplY3QpO1xuXG5cdFx0XHRyZWFkYWJsZVN0cmVhbS5vbmNlKCdyZWFkYWJsZScsICgpID0+IHtcblx0XHRcdFx0KGFzeW5jICgpID0+IHtcblx0XHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdFx0Ly8gU2V0IHVwIG91dHB1dCBzdHJlYW1cblx0XHRcdFx0XHRcdGNvbnN0IHBhc3MgPSBuZXcgc3RyZWFtLlBhc3NUaHJvdWdoKCk7XG5cdFx0XHRcdFx0XHRjb25zdCBvdXRwdXRTdHJlYW0gPSBzdHJlYW0ucGlwZWxpbmUgPyBzdHJlYW0ucGlwZWxpbmUocmVhZGFibGVTdHJlYW0sIHBhc3MsICgpID0+IHt9KSA6IHJlYWRhYmxlU3RyZWFtLnBpcGUocGFzcyk7XG5cblx0XHRcdFx0XHRcdC8vIFJlYWQgdGhlIGlucHV0IHN0cmVhbSBhbmQgZGV0ZWN0IHRoZSBmaWxldHlwZVxuXHRcdFx0XHRcdFx0Y29uc3QgY2h1bmsgPSByZWFkYWJsZVN0cmVhbS5yZWFkKHNhbXBsZVNpemUpID8/IHJlYWRhYmxlU3RyZWFtLnJlYWQoKSA/PyBCdWZmZXIuYWxsb2MoMCk7XG5cdFx0XHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdFx0XHRwYXNzLmZpbGVUeXBlID0gYXdhaXQgdGhpcy5mcm9tQnVmZmVyKGNodW5rKTtcblx0XHRcdFx0XHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRcdFx0XHRcdGlmIChlcnJvciBpbnN0YW5jZW9mIHN0cnRvazMuRW5kT2ZTdHJlYW1FcnJvcikge1xuXHRcdFx0XHRcdFx0XHRcdHBhc3MuZmlsZVR5cGUgPSB1bmRlZmluZWQ7XG5cdFx0XHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRcdFx0cmVqZWN0KGVycm9yKTtcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0XHRyZXNvbHZlKG91dHB1dFN0cmVhbSk7XG5cdFx0XHRcdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdFx0XHRcdHJlamVjdChlcnJvcik7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9KSgpO1xuXHRcdFx0fSk7XG5cdFx0fSk7XG5cdH1cblxuXHRjaGVjayhoZWFkZXIsIG9wdGlvbnMpIHtcblx0XHRyZXR1cm4gX2NoZWNrKHRoaXMuYnVmZmVyLCBoZWFkZXIsIG9wdGlvbnMpO1xuXHR9XG5cblx0Y2hlY2tTdHJpbmcoaGVhZGVyLCBvcHRpb25zKSB7XG5cdFx0cmV0dXJuIHRoaXMuY2hlY2soc3RyaW5nVG9CeXRlcyhoZWFkZXIpLCBvcHRpb25zKTtcblx0fVxuXG5cdGFzeW5jIHBhcnNlKHRva2VuaXplcikge1xuXHRcdHRoaXMuYnVmZmVyID0gQnVmZmVyLmFsbG9jKG1pbmltdW1CeXRlcyk7XG5cblx0XHQvLyBLZWVwIHJlYWRpbmcgdW50aWwgRU9GIGlmIHRoZSBmaWxlIHNpemUgaXMgdW5rbm93bi5cblx0XHRpZiAodG9rZW5pemVyLmZpbGVJbmZvLnNpemUgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0dG9rZW5pemVyLmZpbGVJbmZvLnNpemUgPSBOdW1iZXIuTUFYX1NBRkVfSU5URUdFUjtcblx0XHR9XG5cblx0XHR0aGlzLnRva2VuaXplciA9IHRva2VuaXplcjtcblxuXHRcdGF3YWl0IHRva2VuaXplci5wZWVrQnVmZmVyKHRoaXMuYnVmZmVyLCB7bGVuZ3RoOiAxMiwgbWF5QmVMZXNzOiB0cnVlfSk7XG5cblx0XHQvLyAtLSAyLWJ5dGUgc2lnbmF0dXJlcyAtLVxuXG5cdFx0aWYgKHRoaXMuY2hlY2soWzB4NDIsIDB4NERdKSkge1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0ZXh0OiAnYm1wJyxcblx0XHRcdFx0bWltZTogJ2ltYWdlL2JtcCcsXG5cdFx0XHR9O1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLmNoZWNrKFsweDBCLCAweDc3XSkpIHtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdGV4dDogJ2FjMycsXG5cdFx0XHRcdG1pbWU6ICdhdWRpby92bmQuZG9sYnkuZGQtcmF3Jyxcblx0XHRcdH07XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuY2hlY2soWzB4NzgsIDB4MDFdKSkge1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0ZXh0OiAnZG1nJyxcblx0XHRcdFx0bWltZTogJ2FwcGxpY2F0aW9uL3gtYXBwbGUtZGlza2ltYWdlJyxcblx0XHRcdH07XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuY2hlY2soWzB4NEQsIDB4NUFdKSkge1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0ZXh0OiAnZXhlJyxcblx0XHRcdFx0bWltZTogJ2FwcGxpY2F0aW9uL3gtbXNkb3dubG9hZCcsXG5cdFx0XHR9O1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLmNoZWNrKFsweDI1LCAweDIxXSkpIHtcblx0XHRcdGF3YWl0IHRva2VuaXplci5wZWVrQnVmZmVyKHRoaXMuYnVmZmVyLCB7bGVuZ3RoOiAyNCwgbWF5QmVMZXNzOiB0cnVlfSk7XG5cblx0XHRcdGlmIChcblx0XHRcdFx0dGhpcy5jaGVja1N0cmluZygnUFMtQWRvYmUtJywge29mZnNldDogMn0pXG5cdFx0XHRcdCYmIHRoaXMuY2hlY2tTdHJpbmcoJyBFUFNGLScsIHtvZmZzZXQ6IDE0fSlcblx0XHRcdCkge1xuXHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdGV4dDogJ2VwcycsXG5cdFx0XHRcdFx0bWltZTogJ2FwcGxpY2F0aW9uL2VwcycsXG5cdFx0XHRcdH07XG5cdFx0XHR9XG5cblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdGV4dDogJ3BzJyxcblx0XHRcdFx0bWltZTogJ2FwcGxpY2F0aW9uL3Bvc3RzY3JpcHQnLFxuXHRcdFx0fTtcblx0XHR9XG5cblx0XHRpZiAoXG5cdFx0XHR0aGlzLmNoZWNrKFsweDFGLCAweEEwXSlcblx0XHRcdHx8IHRoaXMuY2hlY2soWzB4MUYsIDB4OURdKVxuXHRcdCkge1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0ZXh0OiAnWicsXG5cdFx0XHRcdG1pbWU6ICdhcHBsaWNhdGlvbi94LWNvbXByZXNzJyxcblx0XHRcdH07XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuY2hlY2soWzB4QzcsIDB4NzFdKSkge1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0ZXh0OiAnY3BpbycsXG5cdFx0XHRcdG1pbWU6ICdhcHBsaWNhdGlvbi94LWNwaW8nLFxuXHRcdFx0fTtcblx0XHR9XG5cblx0XHRpZiAodGhpcy5jaGVjayhbMHg2MCwgMHhFQV0pKSB7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRleHQ6ICdhcmonLFxuXHRcdFx0XHRtaW1lOiAnYXBwbGljYXRpb24veC1hcmonLFxuXHRcdFx0fTtcblx0XHR9XG5cblx0XHQvLyAtLSAzLWJ5dGUgc2lnbmF0dXJlcyAtLVxuXG5cdFx0aWYgKHRoaXMuY2hlY2soWzB4RUYsIDB4QkIsIDB4QkZdKSkgeyAvLyBVVEYtOC1CT01cblx0XHRcdC8vIFN0cmlwIG9mZiBVVEYtOC1CT01cblx0XHRcdHRoaXMudG9rZW5pemVyLmlnbm9yZSgzKTtcblx0XHRcdHJldHVybiB0aGlzLnBhcnNlKHRva2VuaXplcik7XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuY2hlY2soWzB4NDcsIDB4NDksIDB4NDZdKSkge1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0ZXh0OiAnZ2lmJyxcblx0XHRcdFx0bWltZTogJ2ltYWdlL2dpZicsXG5cdFx0XHR9O1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLmNoZWNrKFsweDQ5LCAweDQ5LCAweEJDXSkpIHtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdGV4dDogJ2p4cicsXG5cdFx0XHRcdG1pbWU6ICdpbWFnZS92bmQubXMtcGhvdG8nLFxuXHRcdFx0fTtcblx0XHR9XG5cblx0XHRpZiAodGhpcy5jaGVjayhbMHgxRiwgMHg4QiwgMHg4XSkpIHtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdGV4dDogJ2d6Jyxcblx0XHRcdFx0bWltZTogJ2FwcGxpY2F0aW9uL2d6aXAnLFxuXHRcdFx0fTtcblx0XHR9XG5cblx0XHRpZiAodGhpcy5jaGVjayhbMHg0MiwgMHg1QSwgMHg2OF0pKSB7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRleHQ6ICdiejInLFxuXHRcdFx0XHRtaW1lOiAnYXBwbGljYXRpb24veC1iemlwMicsXG5cdFx0XHR9O1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLmNoZWNrU3RyaW5nKCdJRDMnKSkge1xuXHRcdFx0YXdhaXQgdG9rZW5pemVyLmlnbm9yZSg2KTsgLy8gU2tpcCBJRDMgaGVhZGVyIHVudGlsIHRoZSBoZWFkZXIgc2l6ZVxuXHRcdFx0Y29uc3QgaWQzSGVhZGVyTGVuZ3RoID0gYXdhaXQgdG9rZW5pemVyLnJlYWRUb2tlbih1aW50MzJTeW5jU2FmZVRva2VuKTtcblx0XHRcdGlmICh0b2tlbml6ZXIucG9zaXRpb24gKyBpZDNIZWFkZXJMZW5ndGggPiB0b2tlbml6ZXIuZmlsZUluZm8uc2l6ZSkge1xuXHRcdFx0XHQvLyBHdWVzcyBmaWxlIHR5cGUgYmFzZWQgb24gSUQzIGhlYWRlciBmb3IgYmFja3dhcmQgY29tcGF0aWJpbGl0eVxuXHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdGV4dDogJ21wMycsXG5cdFx0XHRcdFx0bWltZTogJ2F1ZGlvL21wZWcnLFxuXHRcdFx0XHR9O1xuXHRcdFx0fVxuXG5cdFx0XHRhd2FpdCB0b2tlbml6ZXIuaWdub3JlKGlkM0hlYWRlckxlbmd0aCk7XG5cdFx0XHRyZXR1cm4gdGhpcy5mcm9tVG9rZW5pemVyKHRva2VuaXplcik7IC8vIFNraXAgSUQzIGhlYWRlciwgcmVjdXJzaW9uXG5cdFx0fVxuXG5cdFx0Ly8gTXVzZXBhY2ssIFNWN1xuXHRcdGlmICh0aGlzLmNoZWNrU3RyaW5nKCdNUCsnKSkge1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0ZXh0OiAnbXBjJyxcblx0XHRcdFx0bWltZTogJ2F1ZGlvL3gtbXVzZXBhY2snLFxuXHRcdFx0fTtcblx0XHR9XG5cblx0XHRpZiAoXG5cdFx0XHQodGhpcy5idWZmZXJbMF0gPT09IDB4NDMgfHwgdGhpcy5idWZmZXJbMF0gPT09IDB4NDYpXG5cdFx0XHQmJiB0aGlzLmNoZWNrKFsweDU3LCAweDUzXSwge29mZnNldDogMX0pXG5cdFx0KSB7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRleHQ6ICdzd2YnLFxuXHRcdFx0XHRtaW1lOiAnYXBwbGljYXRpb24veC1zaG9ja3dhdmUtZmxhc2gnLFxuXHRcdFx0fTtcblx0XHR9XG5cblx0XHQvLyAtLSA0LWJ5dGUgc2lnbmF0dXJlcyAtLVxuXG5cdFx0Ly8gUmVxdWlyZXMgYSBzYW1wbGUgc2l6ZSBvZiA0IGJ5dGVzXG5cdFx0aWYgKHRoaXMuY2hlY2soWzB4RkYsIDB4RDgsIDB4RkZdKSkge1xuXHRcdFx0aWYgKHRoaXMuY2hlY2soWzB4RjddLCB7b2Zmc2V0OiAzfSkpIHsgLy8gSlBHNy9TT0Y1NSwgaW5kaWNhdGluZyBhIElTTy9JRUMgMTQ0OTUgLyBKUEVHLUxTIGZpbGVcblx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRleHQ6ICdqbHMnLFxuXHRcdFx0XHRcdG1pbWU6ICdpbWFnZS9qbHMnLFxuXHRcdFx0XHR9O1xuXHRcdFx0fVxuXG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRleHQ6ICdqcGcnLFxuXHRcdFx0XHRtaW1lOiAnaW1hZ2UvanBlZycsXG5cdFx0XHR9O1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLmNoZWNrKFsweDRGLCAweDYyLCAweDZBLCAweDAxXSkpIHtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdGV4dDogJ2F2cm8nLFxuXHRcdFx0XHRtaW1lOiAnYXBwbGljYXRpb24vYXZybycsXG5cdFx0XHR9O1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLmNoZWNrU3RyaW5nKCdGTElGJykpIHtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdGV4dDogJ2ZsaWYnLFxuXHRcdFx0XHRtaW1lOiAnaW1hZ2UvZmxpZicsXG5cdFx0XHR9O1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLmNoZWNrU3RyaW5nKCc4QlBTJykpIHtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdGV4dDogJ3BzZCcsXG5cdFx0XHRcdG1pbWU6ICdpbWFnZS92bmQuYWRvYmUucGhvdG9zaG9wJyxcblx0XHRcdH07XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuY2hlY2tTdHJpbmcoJ1dFQlAnLCB7b2Zmc2V0OiA4fSkpIHtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdGV4dDogJ3dlYnAnLFxuXHRcdFx0XHRtaW1lOiAnaW1hZ2Uvd2VicCcsXG5cdFx0XHR9O1xuXHRcdH1cblxuXHRcdC8vIE11c2VwYWNrLCBTVjhcblx0XHRpZiAodGhpcy5jaGVja1N0cmluZygnTVBDSycpKSB7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRleHQ6ICdtcGMnLFxuXHRcdFx0XHRtaW1lOiAnYXVkaW8veC1tdXNlcGFjaycsXG5cdFx0XHR9O1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLmNoZWNrU3RyaW5nKCdGT1JNJykpIHtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdGV4dDogJ2FpZicsXG5cdFx0XHRcdG1pbWU6ICdhdWRpby9haWZmJyxcblx0XHRcdH07XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuY2hlY2tTdHJpbmcoJ2ljbnMnLCB7b2Zmc2V0OiAwfSkpIHtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdGV4dDogJ2ljbnMnLFxuXHRcdFx0XHRtaW1lOiAnaW1hZ2UvaWNucycsXG5cdFx0XHR9O1xuXHRcdH1cblxuXHRcdC8vIFppcC1iYXNlZCBmaWxlIGZvcm1hdHNcblx0XHQvLyBOZWVkIHRvIGJlIGJlZm9yZSB0aGUgYHppcGAgY2hlY2tcblx0XHRpZiAodGhpcy5jaGVjayhbMHg1MCwgMHg0QiwgMHgzLCAweDRdKSkgeyAvLyBMb2NhbCBmaWxlIGhlYWRlciBzaWduYXR1cmVcblx0XHRcdHRyeSB7XG5cdFx0XHRcdHdoaWxlICh0b2tlbml6ZXIucG9zaXRpb24gKyAzMCA8IHRva2VuaXplci5maWxlSW5mby5zaXplKSB7XG5cdFx0XHRcdFx0YXdhaXQgdG9rZW5pemVyLnJlYWRCdWZmZXIodGhpcy5idWZmZXIsIHtsZW5ndGg6IDMwfSk7XG5cblx0XHRcdFx0XHQvLyBodHRwczovL2VuLndpa2lwZWRpYS5vcmcvd2lraS9aaXBfKGZpbGVfZm9ybWF0KSNGaWxlX2hlYWRlcnNcblx0XHRcdFx0XHRjb25zdCB6aXBIZWFkZXIgPSB7XG5cdFx0XHRcdFx0XHRjb21wcmVzc2VkU2l6ZTogdGhpcy5idWZmZXIucmVhZFVJbnQzMkxFKDE4KSxcblx0XHRcdFx0XHRcdHVuY29tcHJlc3NlZFNpemU6IHRoaXMuYnVmZmVyLnJlYWRVSW50MzJMRSgyMiksXG5cdFx0XHRcdFx0XHRmaWxlbmFtZUxlbmd0aDogdGhpcy5idWZmZXIucmVhZFVJbnQxNkxFKDI2KSxcblx0XHRcdFx0XHRcdGV4dHJhRmllbGRMZW5ndGg6IHRoaXMuYnVmZmVyLnJlYWRVSW50MTZMRSgyOCksXG5cdFx0XHRcdFx0fTtcblxuXHRcdFx0XHRcdHppcEhlYWRlci5maWxlbmFtZSA9IGF3YWl0IHRva2VuaXplci5yZWFkVG9rZW4obmV3IFRva2VuLlN0cmluZ1R5cGUoemlwSGVhZGVyLmZpbGVuYW1lTGVuZ3RoLCAndXRmLTgnKSk7XG5cdFx0XHRcdFx0YXdhaXQgdG9rZW5pemVyLmlnbm9yZSh6aXBIZWFkZXIuZXh0cmFGaWVsZExlbmd0aCk7XG5cblx0XHRcdFx0XHQvLyBBc3N1bWVzIHNpZ25lZCBgLnhwaWAgZnJvbSBhZGRvbnMubW96aWxsYS5vcmdcblx0XHRcdFx0XHRpZiAoemlwSGVhZGVyLmZpbGVuYW1lID09PSAnTUVUQS1JTkYvbW96aWxsYS5yc2EnKSB7XG5cdFx0XHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdFx0XHRleHQ6ICd4cGknLFxuXHRcdFx0XHRcdFx0XHRtaW1lOiAnYXBwbGljYXRpb24veC14cGluc3RhbGwnLFxuXHRcdFx0XHRcdFx0fTtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRpZiAoemlwSGVhZGVyLmZpbGVuYW1lLmVuZHNXaXRoKCcucmVscycpIHx8IHppcEhlYWRlci5maWxlbmFtZS5lbmRzV2l0aCgnLnhtbCcpKSB7XG5cdFx0XHRcdFx0XHRjb25zdCB0eXBlID0gemlwSGVhZGVyLmZpbGVuYW1lLnNwbGl0KCcvJylbMF07XG5cdFx0XHRcdFx0XHRzd2l0Y2ggKHR5cGUpIHtcblx0XHRcdFx0XHRcdFx0Y2FzZSAnX3JlbHMnOlxuXHRcdFx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRcdFx0XHRjYXNlICd3b3JkJzpcblx0XHRcdFx0XHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdFx0XHRcdFx0ZXh0OiAnZG9jeCcsXG5cdFx0XHRcdFx0XHRcdFx0XHRtaW1lOiAnYXBwbGljYXRpb24vdm5kLm9wZW54bWxmb3JtYXRzLW9mZmljZWRvY3VtZW50LndvcmRwcm9jZXNzaW5nbWwuZG9jdW1lbnQnLFxuXHRcdFx0XHRcdFx0XHRcdH07XG5cdFx0XHRcdFx0XHRcdGNhc2UgJ3BwdCc6XG5cdFx0XHRcdFx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRcdFx0XHRcdGV4dDogJ3BwdHgnLFxuXHRcdFx0XHRcdFx0XHRcdFx0bWltZTogJ2FwcGxpY2F0aW9uL3ZuZC5vcGVueG1sZm9ybWF0cy1vZmZpY2Vkb2N1bWVudC5wcmVzZW50YXRpb25tbC5wcmVzZW50YXRpb24nLFxuXHRcdFx0XHRcdFx0XHRcdH07XG5cdFx0XHRcdFx0XHRcdGNhc2UgJ3hsJzpcblx0XHRcdFx0XHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdFx0XHRcdFx0ZXh0OiAneGxzeCcsXG5cdFx0XHRcdFx0XHRcdFx0XHRtaW1lOiAnYXBwbGljYXRpb24vdm5kLm9wZW54bWxmb3JtYXRzLW9mZmljZWRvY3VtZW50LnNwcmVhZHNoZWV0bWwuc2hlZXQnLFxuXHRcdFx0XHRcdFx0XHRcdH07XG5cdFx0XHRcdFx0XHRcdGRlZmF1bHQ6XG5cdFx0XHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0aWYgKHppcEhlYWRlci5maWxlbmFtZS5zdGFydHNXaXRoKCd4bC8nKSkge1xuXHRcdFx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRcdFx0ZXh0OiAneGxzeCcsXG5cdFx0XHRcdFx0XHRcdG1pbWU6ICdhcHBsaWNhdGlvbi92bmQub3BlbnhtbGZvcm1hdHMtb2ZmaWNlZG9jdW1lbnQuc3ByZWFkc2hlZXRtbC5zaGVldCcsXG5cdFx0XHRcdFx0XHR9O1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdGlmICh6aXBIZWFkZXIuZmlsZW5hbWUuc3RhcnRzV2l0aCgnM0QvJykgJiYgemlwSGVhZGVyLmZpbGVuYW1lLmVuZHNXaXRoKCcubW9kZWwnKSkge1xuXHRcdFx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRcdFx0ZXh0OiAnM21mJyxcblx0XHRcdFx0XHRcdFx0bWltZTogJ21vZGVsLzNtZicsXG5cdFx0XHRcdFx0XHR9O1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdC8vIFRoZSBkb2N4LCB4bHN4IGFuZCBwcHR4IGZpbGUgdHlwZXMgZXh0ZW5kIHRoZSBPZmZpY2UgT3BlbiBYTUwgZmlsZSBmb3JtYXQ6XG5cdFx0XHRcdFx0Ly8gaHR0cHM6Ly9lbi53aWtpcGVkaWEub3JnL3dpa2kvT2ZmaWNlX09wZW5fWE1MX2ZpbGVfZm9ybWF0c1xuXHRcdFx0XHRcdC8vIFdlIGxvb2sgZm9yOlxuXHRcdFx0XHRcdC8vIC0gb25lIGVudHJ5IG5hbWVkICdbQ29udGVudF9UeXBlc10ueG1sJyBvciAnX3JlbHMvLnJlbHMnLFxuXHRcdFx0XHRcdC8vIC0gb25lIGVudHJ5IGluZGljYXRpbmcgc3BlY2lmaWMgdHlwZSBvZiBmaWxlLlxuXHRcdFx0XHRcdC8vIE1TIE9mZmljZSwgT3Blbk9mZmljZSBhbmQgTGlicmVPZmZpY2UgbWF5IHB1dCB0aGUgcGFydHMgaW4gZGlmZmVyZW50IG9yZGVyLCBzbyB0aGUgY2hlY2sgc2hvdWxkIG5vdCByZWx5IG9uIGl0LlxuXHRcdFx0XHRcdGlmICh6aXBIZWFkZXIuZmlsZW5hbWUgPT09ICdtaW1ldHlwZScgJiYgemlwSGVhZGVyLmNvbXByZXNzZWRTaXplID09PSB6aXBIZWFkZXIudW5jb21wcmVzc2VkU2l6ZSkge1xuXHRcdFx0XHRcdFx0bGV0IG1pbWVUeXBlID0gYXdhaXQgdG9rZW5pemVyLnJlYWRUb2tlbihuZXcgVG9rZW4uU3RyaW5nVHlwZSh6aXBIZWFkZXIuY29tcHJlc3NlZFNpemUsICd1dGYtOCcpKTtcblx0XHRcdFx0XHRcdG1pbWVUeXBlID0gbWltZVR5cGUudHJpbSgpO1xuXG5cdFx0XHRcdFx0XHRzd2l0Y2ggKG1pbWVUeXBlKSB7XG5cdFx0XHRcdFx0XHRcdGNhc2UgJ2FwcGxpY2F0aW9uL2VwdWIremlwJzpcblx0XHRcdFx0XHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdFx0XHRcdFx0ZXh0OiAnZXB1YicsXG5cdFx0XHRcdFx0XHRcdFx0XHRtaW1lOiAnYXBwbGljYXRpb24vZXB1Yit6aXAnLFxuXHRcdFx0XHRcdFx0XHRcdH07XG5cdFx0XHRcdFx0XHRcdGNhc2UgJ2FwcGxpY2F0aW9uL3ZuZC5vYXNpcy5vcGVuZG9jdW1lbnQudGV4dCc6XG5cdFx0XHRcdFx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRcdFx0XHRcdGV4dDogJ29kdCcsXG5cdFx0XHRcdFx0XHRcdFx0XHRtaW1lOiAnYXBwbGljYXRpb24vdm5kLm9hc2lzLm9wZW5kb2N1bWVudC50ZXh0Jyxcblx0XHRcdFx0XHRcdFx0XHR9O1xuXHRcdFx0XHRcdFx0XHRjYXNlICdhcHBsaWNhdGlvbi92bmQub2FzaXMub3BlbmRvY3VtZW50LnNwcmVhZHNoZWV0Jzpcblx0XHRcdFx0XHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdFx0XHRcdFx0ZXh0OiAnb2RzJyxcblx0XHRcdFx0XHRcdFx0XHRcdG1pbWU6ICdhcHBsaWNhdGlvbi92bmQub2FzaXMub3BlbmRvY3VtZW50LnNwcmVhZHNoZWV0Jyxcblx0XHRcdFx0XHRcdFx0XHR9O1xuXHRcdFx0XHRcdFx0XHRjYXNlICdhcHBsaWNhdGlvbi92bmQub2FzaXMub3BlbmRvY3VtZW50LnByZXNlbnRhdGlvbic6XG5cdFx0XHRcdFx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRcdFx0XHRcdGV4dDogJ29kcCcsXG5cdFx0XHRcdFx0XHRcdFx0XHRtaW1lOiAnYXBwbGljYXRpb24vdm5kLm9hc2lzLm9wZW5kb2N1bWVudC5wcmVzZW50YXRpb24nLFxuXHRcdFx0XHRcdFx0XHRcdH07XG5cdFx0XHRcdFx0XHRcdGRlZmF1bHQ6XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0Ly8gVHJ5IHRvIGZpbmQgbmV4dCBoZWFkZXIgbWFudWFsbHkgd2hlbiBjdXJyZW50IG9uZSBpcyBjb3JydXB0ZWRcblx0XHRcdFx0XHRpZiAoemlwSGVhZGVyLmNvbXByZXNzZWRTaXplID09PSAwKSB7XG5cdFx0XHRcdFx0XHRsZXQgbmV4dEhlYWRlckluZGV4ID0gLTE7XG5cblx0XHRcdFx0XHRcdHdoaWxlIChuZXh0SGVhZGVySW5kZXggPCAwICYmICh0b2tlbml6ZXIucG9zaXRpb24gPCB0b2tlbml6ZXIuZmlsZUluZm8uc2l6ZSkpIHtcblx0XHRcdFx0XHRcdFx0YXdhaXQgdG9rZW5pemVyLnBlZWtCdWZmZXIodGhpcy5idWZmZXIsIHttYXlCZUxlc3M6IHRydWV9KTtcblxuXHRcdFx0XHRcdFx0XHRuZXh0SGVhZGVySW5kZXggPSB0aGlzLmJ1ZmZlci5pbmRleE9mKCc1MDRCMDMwNCcsIDAsICdoZXgnKTtcblx0XHRcdFx0XHRcdFx0Ly8gTW92ZSBwb3NpdGlvbiB0byB0aGUgbmV4dCBoZWFkZXIgaWYgZm91bmQsIHNraXAgdGhlIHdob2xlIGJ1ZmZlciBvdGhlcndpc2Vcblx0XHRcdFx0XHRcdFx0YXdhaXQgdG9rZW5pemVyLmlnbm9yZShuZXh0SGVhZGVySW5kZXggPj0gMCA/IG5leHRIZWFkZXJJbmRleCA6IHRoaXMuYnVmZmVyLmxlbmd0aCk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdGF3YWl0IHRva2VuaXplci5pZ25vcmUoemlwSGVhZGVyLmNvbXByZXNzZWRTaXplKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRcdGlmICghKGVycm9yIGluc3RhbmNlb2Ygc3RydG9rMy5FbmRPZlN0cmVhbUVycm9yKSkge1xuXHRcdFx0XHRcdHRocm93IGVycm9yO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdGV4dDogJ3ppcCcsXG5cdFx0XHRcdG1pbWU6ICdhcHBsaWNhdGlvbi96aXAnLFxuXHRcdFx0fTtcblx0XHR9XG5cblx0XHRpZiAodGhpcy5jaGVja1N0cmluZygnT2dnUycpKSB7XG5cdFx0XHQvLyBUaGlzIGlzIGFuIE9HRyBjb250YWluZXJcblx0XHRcdGF3YWl0IHRva2VuaXplci5pZ25vcmUoMjgpO1xuXHRcdFx0Y29uc3QgdHlwZSA9IEJ1ZmZlci5hbGxvYyg4KTtcblx0XHRcdGF3YWl0IHRva2VuaXplci5yZWFkQnVmZmVyKHR5cGUpO1xuXG5cdFx0XHQvLyBOZWVkcyB0byBiZSBiZWZvcmUgYG9nZ2AgY2hlY2tcblx0XHRcdGlmIChfY2hlY2sodHlwZSwgWzB4NEYsIDB4NzAsIDB4NzUsIDB4NzMsIDB4NDgsIDB4NjUsIDB4NjEsIDB4NjRdKSkge1xuXHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdGV4dDogJ29wdXMnLFxuXHRcdFx0XHRcdG1pbWU6ICdhdWRpby9vcHVzJyxcblx0XHRcdFx0fTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gSWYgJyB0aGVvcmEnIGluIGhlYWRlci5cblx0XHRcdGlmIChfY2hlY2sodHlwZSwgWzB4ODAsIDB4NzQsIDB4NjgsIDB4NjUsIDB4NkYsIDB4NzIsIDB4NjFdKSkge1xuXHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdGV4dDogJ29ndicsXG5cdFx0XHRcdFx0bWltZTogJ3ZpZGVvL29nZycsXG5cdFx0XHRcdH07XG5cdFx0XHR9XG5cblx0XHRcdC8vIElmICdcXHgwMXZpZGVvJyBpbiBoZWFkZXIuXG5cdFx0XHRpZiAoX2NoZWNrKHR5cGUsIFsweDAxLCAweDc2LCAweDY5LCAweDY0LCAweDY1LCAweDZGLCAweDAwXSkpIHtcblx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRleHQ6ICdvZ20nLFxuXHRcdFx0XHRcdG1pbWU6ICd2aWRlby9vZ2cnLFxuXHRcdFx0XHR9O1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBJZiAnIEZMQUMnIGluIGhlYWRlciAgaHR0cHM6Ly94aXBoLm9yZy9mbGFjL2ZhcS5odG1sXG5cdFx0XHRpZiAoX2NoZWNrKHR5cGUsIFsweDdGLCAweDQ2LCAweDRDLCAweDQxLCAweDQzXSkpIHtcblx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRleHQ6ICdvZ2EnLFxuXHRcdFx0XHRcdG1pbWU6ICdhdWRpby9vZ2cnLFxuXHRcdFx0XHR9O1xuXHRcdFx0fVxuXG5cdFx0XHQvLyAnU3BlZXggICcgaW4gaGVhZGVyIGh0dHBzOi8vZW4ud2lraXBlZGlhLm9yZy93aWtpL1NwZWV4XG5cdFx0XHRpZiAoX2NoZWNrKHR5cGUsIFsweDUzLCAweDcwLCAweDY1LCAweDY1LCAweDc4LCAweDIwLCAweDIwXSkpIHtcblx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRleHQ6ICdzcHgnLFxuXHRcdFx0XHRcdG1pbWU6ICdhdWRpby9vZ2cnLFxuXHRcdFx0XHR9O1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBJZiAnXFx4MDF2b3JiaXMnIGluIGhlYWRlclxuXHRcdFx0aWYgKF9jaGVjayh0eXBlLCBbMHgwMSwgMHg3NiwgMHg2RiwgMHg3MiwgMHg2MiwgMHg2OSwgMHg3M10pKSB7XG5cdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0ZXh0OiAnb2dnJyxcblx0XHRcdFx0XHRtaW1lOiAnYXVkaW8vb2dnJyxcblx0XHRcdFx0fTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gRGVmYXVsdCBPR0cgY29udGFpbmVyIGh0dHBzOi8vd3d3LmlhbmEub3JnL2Fzc2lnbm1lbnRzL21lZGlhLXR5cGVzL2FwcGxpY2F0aW9uL29nZ1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0ZXh0OiAnb2d4Jyxcblx0XHRcdFx0bWltZTogJ2FwcGxpY2F0aW9uL29nZycsXG5cdFx0XHR9O1xuXHRcdH1cblxuXHRcdGlmIChcblx0XHRcdHRoaXMuY2hlY2soWzB4NTAsIDB4NEJdKVxuXHRcdFx0JiYgKHRoaXMuYnVmZmVyWzJdID09PSAweDMgfHwgdGhpcy5idWZmZXJbMl0gPT09IDB4NSB8fCB0aGlzLmJ1ZmZlclsyXSA9PT0gMHg3KVxuXHRcdFx0JiYgKHRoaXMuYnVmZmVyWzNdID09PSAweDQgfHwgdGhpcy5idWZmZXJbM10gPT09IDB4NiB8fCB0aGlzLmJ1ZmZlclszXSA9PT0gMHg4KVxuXHRcdCkge1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0ZXh0OiAnemlwJyxcblx0XHRcdFx0bWltZTogJ2FwcGxpY2F0aW9uL3ppcCcsXG5cdFx0XHR9O1xuXHRcdH1cblxuXHRcdC8vXG5cblx0XHQvLyBGaWxlIFR5cGUgQm94IChodHRwczovL2VuLndpa2lwZWRpYS5vcmcvd2lraS9JU09fYmFzZV9tZWRpYV9maWxlX2Zvcm1hdClcblx0XHQvLyBJdCdzIG5vdCByZXF1aXJlZCB0byBiZSBmaXJzdCwgYnV0IGl0J3MgcmVjb21tZW5kZWQgdG8gYmUuIEFsbW9zdCBhbGwgSVNPIGJhc2UgbWVkaWEgZmlsZXMgc3RhcnQgd2l0aCBgZnR5cGAgYm94LlxuXHRcdC8vIGBmdHlwYCBib3ggbXVzdCBjb250YWluIGEgYnJhbmQgbWFqb3IgaWRlbnRpZmllciwgd2hpY2ggbXVzdCBjb25zaXN0IG9mIElTTyA4ODU5LTEgcHJpbnRhYmxlIGNoYXJhY3RlcnMuXG5cdFx0Ly8gSGVyZSB3ZSBjaGVjayBmb3IgODg1OS0xIHByaW50YWJsZSBjaGFyYWN0ZXJzIChmb3Igc2ltcGxpY2l0eSwgaXQncyBhIG1hc2sgd2hpY2ggYWxzbyBjYXRjaGVzIG9uZSBub24tcHJpbnRhYmxlIGNoYXJhY3RlcikuXG5cdFx0aWYgKFxuXHRcdFx0dGhpcy5jaGVja1N0cmluZygnZnR5cCcsIHtvZmZzZXQ6IDR9KVxuXHRcdFx0JiYgKHRoaXMuYnVmZmVyWzhdICYgMHg2MCkgIT09IDB4MDAgLy8gQnJhbmQgbWFqb3IsIGZpcnN0IGNoYXJhY3RlciBBU0NJST9cblx0XHQpIHtcblx0XHRcdC8vIFRoZXkgYWxsIGNhbiBoYXZlIE1JTUUgYHZpZGVvL21wNGAgZXhjZXB0IGBhcHBsaWNhdGlvbi9tcDRgIHNwZWNpYWwtY2FzZSB3aGljaCBpcyBoYXJkIHRvIGRldGVjdC5cblx0XHRcdC8vIEZvciBzb21lIGNhc2VzLCB3ZSdyZSBzcGVjaWZpYywgZXZlcnl0aGluZyBlbHNlIGZhbGxzIHRvIGB2aWRlby9tcDRgIHdpdGggYG1wNGAgZXh0ZW5zaW9uLlxuXHRcdFx0Y29uc3QgYnJhbmRNYWpvciA9IHRoaXMuYnVmZmVyLnRvU3RyaW5nKCdiaW5hcnknLCA4LCAxMikucmVwbGFjZSgnXFwwJywgJyAnKS50cmltKCk7XG5cdFx0XHRzd2l0Y2ggKGJyYW5kTWFqb3IpIHtcblx0XHRcdFx0Y2FzZSAnYXZpZic6XG5cdFx0XHRcdGNhc2UgJ2F2aXMnOlxuXHRcdFx0XHRcdHJldHVybiB7ZXh0OiAnYXZpZicsIG1pbWU6ICdpbWFnZS9hdmlmJ307XG5cdFx0XHRcdGNhc2UgJ21pZjEnOlxuXHRcdFx0XHRcdHJldHVybiB7ZXh0OiAnaGVpYycsIG1pbWU6ICdpbWFnZS9oZWlmJ307XG5cdFx0XHRcdGNhc2UgJ21zZjEnOlxuXHRcdFx0XHRcdHJldHVybiB7ZXh0OiAnaGVpYycsIG1pbWU6ICdpbWFnZS9oZWlmLXNlcXVlbmNlJ307XG5cdFx0XHRcdGNhc2UgJ2hlaWMnOlxuXHRcdFx0XHRjYXNlICdoZWl4Jzpcblx0XHRcdFx0XHRyZXR1cm4ge2V4dDogJ2hlaWMnLCBtaW1lOiAnaW1hZ2UvaGVpYyd9O1xuXHRcdFx0XHRjYXNlICdoZXZjJzpcblx0XHRcdFx0Y2FzZSAnaGV2eCc6XG5cdFx0XHRcdFx0cmV0dXJuIHtleHQ6ICdoZWljJywgbWltZTogJ2ltYWdlL2hlaWMtc2VxdWVuY2UnfTtcblx0XHRcdFx0Y2FzZSAncXQnOlxuXHRcdFx0XHRcdHJldHVybiB7ZXh0OiAnbW92JywgbWltZTogJ3ZpZGVvL3F1aWNrdGltZSd9O1xuXHRcdFx0XHRjYXNlICdNNFYnOlxuXHRcdFx0XHRjYXNlICdNNFZIJzpcblx0XHRcdFx0Y2FzZSAnTTRWUCc6XG5cdFx0XHRcdFx0cmV0dXJuIHtleHQ6ICdtNHYnLCBtaW1lOiAndmlkZW8veC1tNHYnfTtcblx0XHRcdFx0Y2FzZSAnTTRQJzpcblx0XHRcdFx0XHRyZXR1cm4ge2V4dDogJ200cCcsIG1pbWU6ICd2aWRlby9tcDQnfTtcblx0XHRcdFx0Y2FzZSAnTTRCJzpcblx0XHRcdFx0XHRyZXR1cm4ge2V4dDogJ200YicsIG1pbWU6ICdhdWRpby9tcDQnfTtcblx0XHRcdFx0Y2FzZSAnTTRBJzpcblx0XHRcdFx0XHRyZXR1cm4ge2V4dDogJ200YScsIG1pbWU6ICdhdWRpby94LW00YSd9O1xuXHRcdFx0XHRjYXNlICdGNFYnOlxuXHRcdFx0XHRcdHJldHVybiB7ZXh0OiAnZjR2JywgbWltZTogJ3ZpZGVvL21wNCd9O1xuXHRcdFx0XHRjYXNlICdGNFAnOlxuXHRcdFx0XHRcdHJldHVybiB7ZXh0OiAnZjRwJywgbWltZTogJ3ZpZGVvL21wNCd9O1xuXHRcdFx0XHRjYXNlICdGNEEnOlxuXHRcdFx0XHRcdHJldHVybiB7ZXh0OiAnZjRhJywgbWltZTogJ2F1ZGlvL21wNCd9O1xuXHRcdFx0XHRjYXNlICdGNEInOlxuXHRcdFx0XHRcdHJldHVybiB7ZXh0OiAnZjRiJywgbWltZTogJ2F1ZGlvL21wNCd9O1xuXHRcdFx0XHRjYXNlICdjcngnOlxuXHRcdFx0XHRcdHJldHVybiB7ZXh0OiAnY3IzJywgbWltZTogJ2ltYWdlL3gtY2Fub24tY3IzJ307XG5cdFx0XHRcdGRlZmF1bHQ6XG5cdFx0XHRcdFx0aWYgKGJyYW5kTWFqb3Iuc3RhcnRzV2l0aCgnM2cnKSkge1xuXHRcdFx0XHRcdFx0aWYgKGJyYW5kTWFqb3Iuc3RhcnRzV2l0aCgnM2cyJykpIHtcblx0XHRcdFx0XHRcdFx0cmV0dXJuIHtleHQ6ICczZzInLCBtaW1lOiAndmlkZW8vM2dwcDInfTtcblx0XHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdFx0cmV0dXJuIHtleHQ6ICczZ3AnLCBtaW1lOiAndmlkZW8vM2dwcCd9O1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdHJldHVybiB7ZXh0OiAnbXA0JywgbWltZTogJ3ZpZGVvL21wNCd9O1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmICh0aGlzLmNoZWNrU3RyaW5nKCdNVGhkJykpIHtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdGV4dDogJ21pZCcsXG5cdFx0XHRcdG1pbWU6ICdhdWRpby9taWRpJyxcblx0XHRcdH07XG5cdFx0fVxuXG5cdFx0aWYgKFxuXHRcdFx0dGhpcy5jaGVja1N0cmluZygnd09GRicpXG5cdFx0XHQmJiAoXG5cdFx0XHRcdHRoaXMuY2hlY2soWzB4MDAsIDB4MDEsIDB4MDAsIDB4MDBdLCB7b2Zmc2V0OiA0fSlcblx0XHRcdFx0fHwgdGhpcy5jaGVja1N0cmluZygnT1RUTycsIHtvZmZzZXQ6IDR9KVxuXHRcdFx0KVxuXHRcdCkge1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0ZXh0OiAnd29mZicsXG5cdFx0XHRcdG1pbWU6ICdmb250L3dvZmYnLFxuXHRcdFx0fTtcblx0XHR9XG5cblx0XHRpZiAoXG5cdFx0XHR0aGlzLmNoZWNrU3RyaW5nKCd3T0YyJylcblx0XHRcdCYmIChcblx0XHRcdFx0dGhpcy5jaGVjayhbMHgwMCwgMHgwMSwgMHgwMCwgMHgwMF0sIHtvZmZzZXQ6IDR9KVxuXHRcdFx0XHR8fCB0aGlzLmNoZWNrU3RyaW5nKCdPVFRPJywge29mZnNldDogNH0pXG5cdFx0XHQpXG5cdFx0KSB7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRleHQ6ICd3b2ZmMicsXG5cdFx0XHRcdG1pbWU6ICdmb250L3dvZmYyJyxcblx0XHRcdH07XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuY2hlY2soWzB4RDQsIDB4QzMsIDB4QjIsIDB4QTFdKSB8fCB0aGlzLmNoZWNrKFsweEExLCAweEIyLCAweEMzLCAweEQ0XSkpIHtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdGV4dDogJ3BjYXAnLFxuXHRcdFx0XHRtaW1lOiAnYXBwbGljYXRpb24vdm5kLnRjcGR1bXAucGNhcCcsXG5cdFx0XHR9O1xuXHRcdH1cblxuXHRcdC8vIFNvbnkgRFNEIFN0cmVhbSBGaWxlIChEU0YpXG5cdFx0aWYgKHRoaXMuY2hlY2tTdHJpbmcoJ0RTRCAnKSkge1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0ZXh0OiAnZHNmJyxcblx0XHRcdFx0bWltZTogJ2F1ZGlvL3gtZHNmJywgLy8gTm9uLXN0YW5kYXJkXG5cdFx0XHR9O1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLmNoZWNrU3RyaW5nKCdMWklQJykpIHtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdGV4dDogJ2x6Jyxcblx0XHRcdFx0bWltZTogJ2FwcGxpY2F0aW9uL3gtbHppcCcsXG5cdFx0XHR9O1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLmNoZWNrU3RyaW5nKCdmTGFDJykpIHtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdGV4dDogJ2ZsYWMnLFxuXHRcdFx0XHRtaW1lOiAnYXVkaW8veC1mbGFjJyxcblx0XHRcdH07XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuY2hlY2soWzB4NDIsIDB4NTAsIDB4NDcsIDB4RkJdKSkge1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0ZXh0OiAnYnBnJyxcblx0XHRcdFx0bWltZTogJ2ltYWdlL2JwZycsXG5cdFx0XHR9O1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLmNoZWNrU3RyaW5nKCd3dnBrJykpIHtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdGV4dDogJ3d2Jyxcblx0XHRcdFx0bWltZTogJ2F1ZGlvL3dhdnBhY2snLFxuXHRcdFx0fTtcblx0XHR9XG5cblx0XHRpZiAodGhpcy5jaGVja1N0cmluZygnJVBERicpKSB7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRhd2FpdCB0b2tlbml6ZXIuaWdub3JlKDEzNTApO1xuXHRcdFx0XHRjb25zdCBtYXhCdWZmZXJTaXplID0gMTAgKiAxMDI0ICogMTAyNDtcblx0XHRcdFx0Y29uc3QgYnVmZmVyID0gQnVmZmVyLmFsbG9jKE1hdGgubWluKG1heEJ1ZmZlclNpemUsIHRva2VuaXplci5maWxlSW5mby5zaXplKSk7XG5cdFx0XHRcdGF3YWl0IHRva2VuaXplci5yZWFkQnVmZmVyKGJ1ZmZlciwge21heUJlTGVzczogdHJ1ZX0pO1xuXG5cdFx0XHRcdC8vIENoZWNrIGlmIHRoaXMgaXMgYW4gQWRvYmUgSWxsdXN0cmF0b3IgZmlsZVxuXHRcdFx0XHRpZiAoYnVmZmVyLmluY2x1ZGVzKEJ1ZmZlci5mcm9tKCdBSVByaXZhdGVEYXRhJykpKSB7XG5cdFx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRcdGV4dDogJ2FpJyxcblx0XHRcdFx0XHRcdG1pbWU6ICdhcHBsaWNhdGlvbi9wb3N0c2NyaXB0Jyxcblx0XHRcdFx0XHR9O1xuXHRcdFx0XHR9XG5cdFx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0XHQvLyBTd2FsbG93IGVuZCBvZiBzdHJlYW0gZXJyb3IgaWYgZmlsZSBpcyB0b28gc21hbGwgZm9yIHRoZSBBZG9iZSBBSSBjaGVja1xuXHRcdFx0XHRpZiAoIShlcnJvciBpbnN0YW5jZW9mIHN0cnRvazMuRW5kT2ZTdHJlYW1FcnJvcikpIHtcblx0XHRcdFx0XHR0aHJvdyBlcnJvcjtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHQvLyBBc3N1bWUgdGhpcyBpcyBqdXN0IGEgbm9ybWFsIFBERlxuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0ZXh0OiAncGRmJyxcblx0XHRcdFx0bWltZTogJ2FwcGxpY2F0aW9uL3BkZicsXG5cdFx0XHR9O1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLmNoZWNrKFsweDAwLCAweDYxLCAweDczLCAweDZEXSkpIHtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdGV4dDogJ3dhc20nLFxuXHRcdFx0XHRtaW1lOiAnYXBwbGljYXRpb24vd2FzbScsXG5cdFx0XHR9O1xuXHRcdH1cblxuXHRcdC8vIFRJRkYsIGxpdHRsZS1lbmRpYW4gdHlwZVxuXHRcdGlmICh0aGlzLmNoZWNrKFsweDQ5LCAweDQ5XSkpIHtcblx0XHRcdGNvbnN0IGZpbGVUeXBlID0gYXdhaXQgdGhpcy5yZWFkVGlmZkhlYWRlcihmYWxzZSk7XG5cdFx0XHRpZiAoZmlsZVR5cGUpIHtcblx0XHRcdFx0cmV0dXJuIGZpbGVUeXBlO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIFRJRkYsIGJpZy1lbmRpYW4gdHlwZVxuXHRcdGlmICh0aGlzLmNoZWNrKFsweDRELCAweDREXSkpIHtcblx0XHRcdGNvbnN0IGZpbGVUeXBlID0gYXdhaXQgdGhpcy5yZWFkVGlmZkhlYWRlcih0cnVlKTtcblx0XHRcdGlmIChmaWxlVHlwZSkge1xuXHRcdFx0XHRyZXR1cm4gZmlsZVR5cGU7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuY2hlY2tTdHJpbmcoJ01BQyAnKSkge1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0ZXh0OiAnYXBlJyxcblx0XHRcdFx0bWltZTogJ2F1ZGlvL2FwZScsXG5cdFx0XHR9O1xuXHRcdH1cblxuXHRcdC8vIGh0dHBzOi8vZ2l0aHViLmNvbS9maWxlL2ZpbGUvYmxvYi9tYXN0ZXIvbWFnaWMvTWFnZGlyL21hdHJvc2thXG5cdFx0aWYgKHRoaXMuY2hlY2soWzB4MUEsIDB4NDUsIDB4REYsIDB4QTNdKSkgeyAvLyBSb290IGVsZW1lbnQ6IEVCTUxcblx0XHRcdGFzeW5jIGZ1bmN0aW9uIHJlYWRGaWVsZCgpIHtcblx0XHRcdFx0Y29uc3QgbXNiID0gYXdhaXQgdG9rZW5pemVyLnBlZWtOdW1iZXIoVG9rZW4uVUlOVDgpO1xuXHRcdFx0XHRsZXQgbWFzayA9IDB4ODA7XG5cdFx0XHRcdGxldCBpYyA9IDA7IC8vIDAgPSBBLCAxID0gQiwgMiA9IEMsIDNcblx0XHRcdFx0Ly8gPSBEXG5cblx0XHRcdFx0d2hpbGUgKChtc2IgJiBtYXNrKSA9PT0gMCAmJiBtYXNrICE9PSAwKSB7XG5cdFx0XHRcdFx0KytpYztcblx0XHRcdFx0XHRtYXNrID4+PSAxO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Y29uc3QgaWQgPSBCdWZmZXIuYWxsb2MoaWMgKyAxKTtcblx0XHRcdFx0YXdhaXQgdG9rZW5pemVyLnJlYWRCdWZmZXIoaWQpO1xuXHRcdFx0XHRyZXR1cm4gaWQ7XG5cdFx0XHR9XG5cblx0XHRcdGFzeW5jIGZ1bmN0aW9uIHJlYWRFbGVtZW50KCkge1xuXHRcdFx0XHRjb25zdCBpZCA9IGF3YWl0IHJlYWRGaWVsZCgpO1xuXHRcdFx0XHRjb25zdCBsZW5ndGhGaWVsZCA9IGF3YWl0IHJlYWRGaWVsZCgpO1xuXHRcdFx0XHRsZW5ndGhGaWVsZFswXSBePSAweDgwID4+IChsZW5ndGhGaWVsZC5sZW5ndGggLSAxKTtcblx0XHRcdFx0Y29uc3QgbnJMZW5ndGggPSBNYXRoLm1pbig2LCBsZW5ndGhGaWVsZC5sZW5ndGgpOyAvLyBKYXZhU2NyaXB0IGNhbiBtYXggcmVhZCA2IGJ5dGVzIGludGVnZXJcblx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRpZDogaWQucmVhZFVJbnRCRSgwLCBpZC5sZW5ndGgpLFxuXHRcdFx0XHRcdGxlbjogbGVuZ3RoRmllbGQucmVhZFVJbnRCRShsZW5ndGhGaWVsZC5sZW5ndGggLSBuckxlbmd0aCwgbnJMZW5ndGgpLFxuXHRcdFx0XHR9O1xuXHRcdFx0fVxuXG5cdFx0XHRhc3luYyBmdW5jdGlvbiByZWFkQ2hpbGRyZW4oY2hpbGRyZW4pIHtcblx0XHRcdFx0d2hpbGUgKGNoaWxkcmVuID4gMCkge1xuXHRcdFx0XHRcdGNvbnN0IGVsZW1lbnQgPSBhd2FpdCByZWFkRWxlbWVudCgpO1xuXHRcdFx0XHRcdGlmIChlbGVtZW50LmlkID09PSAweDQyXzgyKSB7XG5cdFx0XHRcdFx0XHRjb25zdCByYXdWYWx1ZSA9IGF3YWl0IHRva2VuaXplci5yZWFkVG9rZW4obmV3IFRva2VuLlN0cmluZ1R5cGUoZWxlbWVudC5sZW4sICd1dGYtOCcpKTtcblx0XHRcdFx0XHRcdHJldHVybiByYXdWYWx1ZS5yZXBsYWNlKC9cXDAwLiokL2csICcnKTsgLy8gUmV0dXJuIERvY1R5cGVcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRhd2FpdCB0b2tlbml6ZXIuaWdub3JlKGVsZW1lbnQubGVuKTsgLy8gaWdub3JlIHBheWxvYWRcblx0XHRcdFx0XHQtLWNoaWxkcmVuO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IHJlID0gYXdhaXQgcmVhZEVsZW1lbnQoKTtcblx0XHRcdGNvbnN0IGRvY1R5cGUgPSBhd2FpdCByZWFkQ2hpbGRyZW4ocmUubGVuKTtcblxuXHRcdFx0c3dpdGNoIChkb2NUeXBlKSB7XG5cdFx0XHRcdGNhc2UgJ3dlYm0nOlxuXHRcdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0XHRleHQ6ICd3ZWJtJyxcblx0XHRcdFx0XHRcdG1pbWU6ICd2aWRlby93ZWJtJyxcblx0XHRcdFx0XHR9O1xuXG5cdFx0XHRcdGNhc2UgJ21hdHJvc2thJzpcblx0XHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdFx0ZXh0OiAnbWt2Jyxcblx0XHRcdFx0XHRcdG1pbWU6ICd2aWRlby94LW1hdHJvc2thJyxcblx0XHRcdFx0XHR9O1xuXG5cdFx0XHRcdGRlZmF1bHQ6XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIFJJRkYgZmlsZSBmb3JtYXQgd2hpY2ggbWlnaHQgYmUgQVZJLCBXQVYsIFFDUCwgZXRjXG5cdFx0aWYgKHRoaXMuY2hlY2soWzB4NTIsIDB4NDksIDB4NDYsIDB4NDZdKSkge1xuXHRcdFx0aWYgKHRoaXMuY2hlY2soWzB4NDEsIDB4NTYsIDB4NDldLCB7b2Zmc2V0OiA4fSkpIHtcblx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRleHQ6ICdhdmknLFxuXHRcdFx0XHRcdG1pbWU6ICd2aWRlby92bmQuYXZpJyxcblx0XHRcdFx0fTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKHRoaXMuY2hlY2soWzB4NTcsIDB4NDEsIDB4NTYsIDB4NDVdLCB7b2Zmc2V0OiA4fSkpIHtcblx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRleHQ6ICd3YXYnLFxuXHRcdFx0XHRcdG1pbWU6ICdhdWRpby92bmQud2F2ZScsXG5cdFx0XHRcdH07XG5cdFx0XHR9XG5cblx0XHRcdC8vIFFMQ00sIFFDUCBmaWxlXG5cdFx0XHRpZiAodGhpcy5jaGVjayhbMHg1MSwgMHg0QywgMHg0MywgMHg0RF0sIHtvZmZzZXQ6IDh9KSkge1xuXHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdGV4dDogJ3FjcCcsXG5cdFx0XHRcdFx0bWltZTogJ2F1ZGlvL3FjZWxwJyxcblx0XHRcdFx0fTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAodGhpcy5jaGVja1N0cmluZygnU1FMaScpKSB7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRleHQ6ICdzcWxpdGUnLFxuXHRcdFx0XHRtaW1lOiAnYXBwbGljYXRpb24veC1zcWxpdGUzJyxcblx0XHRcdH07XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuY2hlY2soWzB4NEUsIDB4NDUsIDB4NTMsIDB4MUFdKSkge1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0ZXh0OiAnbmVzJyxcblx0XHRcdFx0bWltZTogJ2FwcGxpY2F0aW9uL3gtbmludGVuZG8tbmVzLXJvbScsXG5cdFx0XHR9O1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLmNoZWNrU3RyaW5nKCdDcjI0JykpIHtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdGV4dDogJ2NyeCcsXG5cdFx0XHRcdG1pbWU6ICdhcHBsaWNhdGlvbi94LWdvb2dsZS1jaHJvbWUtZXh0ZW5zaW9uJyxcblx0XHRcdH07XG5cdFx0fVxuXG5cdFx0aWYgKFxuXHRcdFx0dGhpcy5jaGVja1N0cmluZygnTVNDRicpXG5cdFx0XHR8fCB0aGlzLmNoZWNrU3RyaW5nKCdJU2MoJylcblx0XHQpIHtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdGV4dDogJ2NhYicsXG5cdFx0XHRcdG1pbWU6ICdhcHBsaWNhdGlvbi92bmQubXMtY2FiLWNvbXByZXNzZWQnLFxuXHRcdFx0fTtcblx0XHR9XG5cblx0XHRpZiAodGhpcy5jaGVjayhbMHhFRCwgMHhBQiwgMHhFRSwgMHhEQl0pKSB7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRleHQ6ICdycG0nLFxuXHRcdFx0XHRtaW1lOiAnYXBwbGljYXRpb24veC1ycG0nLFxuXHRcdFx0fTtcblx0XHR9XG5cblx0XHRpZiAodGhpcy5jaGVjayhbMHhDNSwgMHhEMCwgMHhEMywgMHhDNl0pKSB7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRleHQ6ICdlcHMnLFxuXHRcdFx0XHRtaW1lOiAnYXBwbGljYXRpb24vZXBzJyxcblx0XHRcdH07XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuY2hlY2soWzB4MjgsIDB4QjUsIDB4MkYsIDB4RkRdKSkge1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0ZXh0OiAnenN0Jyxcblx0XHRcdFx0bWltZTogJ2FwcGxpY2F0aW9uL3pzdGQnLFxuXHRcdFx0fTtcblx0XHR9XG5cblx0XHRpZiAodGhpcy5jaGVjayhbMHg3RiwgMHg0NSwgMHg0QywgMHg0Nl0pKSB7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRleHQ6ICdlbGYnLFxuXHRcdFx0XHRtaW1lOiAnYXBwbGljYXRpb24veC1lbGYnLFxuXHRcdFx0fTtcblx0XHR9XG5cblx0XHRpZiAodGhpcy5jaGVjayhbMHgyMSwgMHg0MiwgMHg0NCwgMHg0RV0pKSB7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRleHQ6ICdwc3QnLFxuXHRcdFx0XHRtaW1lOiAnYXBwbGljYXRpb24vdm5kLm1zLW91dGxvb2snLFxuXHRcdFx0fTtcblx0XHR9XG5cblx0XHRpZiAodGhpcy5jaGVja1N0cmluZygnUEFSMScpKSB7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRleHQ6ICdwYXJxdWV0Jyxcblx0XHRcdFx0bWltZTogJ2FwcGxpY2F0aW9uL3gtcGFycXVldCcsXG5cdFx0XHR9O1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLmNoZWNrKFsweENGLCAweEZBLCAweEVELCAweEZFXSkpIHtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdGV4dDogJ21hY2hvJyxcblx0XHRcdFx0bWltZTogJ2FwcGxpY2F0aW9uL3gtbWFjaC1iaW5hcnknLFxuXHRcdFx0fTtcblx0XHR9XG5cblx0XHQvLyAtLSA1LWJ5dGUgc2lnbmF0dXJlcyAtLVxuXG5cdFx0aWYgKHRoaXMuY2hlY2soWzB4NEYsIDB4NTQsIDB4NTQsIDB4NEYsIDB4MDBdKSkge1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0ZXh0OiAnb3RmJyxcblx0XHRcdFx0bWltZTogJ2ZvbnQvb3RmJyxcblx0XHRcdH07XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuY2hlY2tTdHJpbmcoJyMhQU1SJykpIHtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdGV4dDogJ2FtcicsXG5cdFx0XHRcdG1pbWU6ICdhdWRpby9hbXInLFxuXHRcdFx0fTtcblx0XHR9XG5cblx0XHRpZiAodGhpcy5jaGVja1N0cmluZygne1xcXFxydGYnKSkge1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0ZXh0OiAncnRmJyxcblx0XHRcdFx0bWltZTogJ2FwcGxpY2F0aW9uL3J0ZicsXG5cdFx0XHR9O1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLmNoZWNrKFsweDQ2LCAweDRDLCAweDU2LCAweDAxXSkpIHtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdGV4dDogJ2ZsdicsXG5cdFx0XHRcdG1pbWU6ICd2aWRlby94LWZsdicsXG5cdFx0XHR9O1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLmNoZWNrU3RyaW5nKCdJTVBNJykpIHtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdGV4dDogJ2l0Jyxcblx0XHRcdFx0bWltZTogJ2F1ZGlvL3gtaXQnLFxuXHRcdFx0fTtcblx0XHR9XG5cblx0XHRpZiAoXG5cdFx0XHR0aGlzLmNoZWNrU3RyaW5nKCctbGgwLScsIHtvZmZzZXQ6IDJ9KVxuXHRcdFx0fHwgdGhpcy5jaGVja1N0cmluZygnLWxoMS0nLCB7b2Zmc2V0OiAyfSlcblx0XHRcdHx8IHRoaXMuY2hlY2tTdHJpbmcoJy1saDItJywge29mZnNldDogMn0pXG5cdFx0XHR8fCB0aGlzLmNoZWNrU3RyaW5nKCctbGgzLScsIHtvZmZzZXQ6IDJ9KVxuXHRcdFx0fHwgdGhpcy5jaGVja1N0cmluZygnLWxoNC0nLCB7b2Zmc2V0OiAyfSlcblx0XHRcdHx8IHRoaXMuY2hlY2tTdHJpbmcoJy1saDUtJywge29mZnNldDogMn0pXG5cdFx0XHR8fCB0aGlzLmNoZWNrU3RyaW5nKCctbGg2LScsIHtvZmZzZXQ6IDJ9KVxuXHRcdFx0fHwgdGhpcy5jaGVja1N0cmluZygnLWxoNy0nLCB7b2Zmc2V0OiAyfSlcblx0XHRcdHx8IHRoaXMuY2hlY2tTdHJpbmcoJy1senMtJywge29mZnNldDogMn0pXG5cdFx0XHR8fCB0aGlzLmNoZWNrU3RyaW5nKCctbHo0LScsIHtvZmZzZXQ6IDJ9KVxuXHRcdFx0fHwgdGhpcy5jaGVja1N0cmluZygnLWx6NS0nLCB7b2Zmc2V0OiAyfSlcblx0XHRcdHx8IHRoaXMuY2hlY2tTdHJpbmcoJy1saGQtJywge29mZnNldDogMn0pXG5cdFx0KSB7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRleHQ6ICdsemgnLFxuXHRcdFx0XHRtaW1lOiAnYXBwbGljYXRpb24veC1semgtY29tcHJlc3NlZCcsXG5cdFx0XHR9O1xuXHRcdH1cblxuXHRcdC8vIE1QRUcgcHJvZ3JhbSBzdHJlYW0gKFBTIG9yIE1QRUctUFMpXG5cdFx0aWYgKHRoaXMuY2hlY2soWzB4MDAsIDB4MDAsIDB4MDEsIDB4QkFdKSkge1xuXHRcdFx0Ly8gIE1QRUctUFMsIE1QRUctMSBQYXJ0IDFcblx0XHRcdGlmICh0aGlzLmNoZWNrKFsweDIxXSwge29mZnNldDogNCwgbWFzazogWzB4RjFdfSkpIHtcblx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRleHQ6ICdtcGcnLCAvLyBNYXkgYWxzbyBiZSAucHMsIC5tcGVnXG5cdFx0XHRcdFx0bWltZTogJ3ZpZGVvL01QMVMnLFxuXHRcdFx0XHR9O1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBNUEVHLVBTLCBNUEVHLTIgUGFydCAxXG5cdFx0XHRpZiAodGhpcy5jaGVjayhbMHg0NF0sIHtvZmZzZXQ6IDQsIG1hc2s6IFsweEM0XX0pKSB7XG5cdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0ZXh0OiAnbXBnJywgLy8gTWF5IGFsc28gYmUgLm1wZywgLm0ycCwgLnZvYiBvciAuc3ViXG5cdFx0XHRcdFx0bWltZTogJ3ZpZGVvL01QMlAnLFxuXHRcdFx0XHR9O1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmICh0aGlzLmNoZWNrU3RyaW5nKCdJVFNGJykpIHtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdGV4dDogJ2NobScsXG5cdFx0XHRcdG1pbWU6ICdhcHBsaWNhdGlvbi92bmQubXMtaHRtbGhlbHAnLFxuXHRcdFx0fTtcblx0XHR9XG5cblx0XHRpZiAodGhpcy5jaGVjayhbMHhDQSwgMHhGRSwgMHhCQSwgMHhCRV0pKSB7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRleHQ6ICdjbGFzcycsXG5cdFx0XHRcdG1pbWU6ICdhcHBsaWNhdGlvbi9qYXZhLXZtJyxcblx0XHRcdH07XG5cdFx0fVxuXG5cdFx0Ly8gLS0gNi1ieXRlIHNpZ25hdHVyZXMgLS1cblxuXHRcdGlmICh0aGlzLmNoZWNrKFsweEZELCAweDM3LCAweDdBLCAweDU4LCAweDVBLCAweDAwXSkpIHtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdGV4dDogJ3h6Jyxcblx0XHRcdFx0bWltZTogJ2FwcGxpY2F0aW9uL3gteHonLFxuXHRcdFx0fTtcblx0XHR9XG5cblx0XHRpZiAodGhpcy5jaGVja1N0cmluZygnPD94bWwgJykpIHtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdGV4dDogJ3htbCcsXG5cdFx0XHRcdG1pbWU6ICdhcHBsaWNhdGlvbi94bWwnLFxuXHRcdFx0fTtcblx0XHR9XG5cblx0XHRpZiAodGhpcy5jaGVjayhbMHgzNywgMHg3QSwgMHhCQywgMHhBRiwgMHgyNywgMHgxQ10pKSB7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRleHQ6ICc3eicsXG5cdFx0XHRcdG1pbWU6ICdhcHBsaWNhdGlvbi94LTd6LWNvbXByZXNzZWQnLFxuXHRcdFx0fTtcblx0XHR9XG5cblx0XHRpZiAoXG5cdFx0XHR0aGlzLmNoZWNrKFsweDUyLCAweDYxLCAweDcyLCAweDIxLCAweDFBLCAweDddKVxuXHRcdFx0JiYgKHRoaXMuYnVmZmVyWzZdID09PSAweDAgfHwgdGhpcy5idWZmZXJbNl0gPT09IDB4MSlcblx0XHQpIHtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdGV4dDogJ3JhcicsXG5cdFx0XHRcdG1pbWU6ICdhcHBsaWNhdGlvbi94LXJhci1jb21wcmVzc2VkJyxcblx0XHRcdH07XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuY2hlY2tTdHJpbmcoJ3NvbGlkICcpKSB7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRleHQ6ICdzdGwnLFxuXHRcdFx0XHRtaW1lOiAnbW9kZWwvc3RsJyxcblx0XHRcdH07XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuY2hlY2tTdHJpbmcoJ0FDJykpIHtcblx0XHRcdGNvbnN0IHZlcnNpb24gPSB0aGlzLmJ1ZmZlci50b1N0cmluZygnYmluYXJ5JywgMiwgNik7XG5cdFx0XHRpZiAodmVyc2lvbi5tYXRjaCgnXmQqJykgJiYgdmVyc2lvbiA+PSAxMDAwICYmIHZlcnNpb24gPD0gMTA1MCkge1xuXHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdGV4dDogJ2R3ZycsXG5cdFx0XHRcdFx0bWltZTogJ2ltYWdlL3ZuZC5kd2cnLFxuXHRcdFx0XHR9O1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmICh0aGlzLmNoZWNrU3RyaW5nKCcwNzA3MDcnKSkge1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0ZXh0OiAnY3BpbycsXG5cdFx0XHRcdG1pbWU6ICdhcHBsaWNhdGlvbi94LWNwaW8nLFxuXHRcdFx0fTtcblx0XHR9XG5cblx0XHQvLyAtLSA3LWJ5dGUgc2lnbmF0dXJlcyAtLVxuXG5cdFx0aWYgKHRoaXMuY2hlY2tTdHJpbmcoJ0JMRU5ERVInKSkge1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0ZXh0OiAnYmxlbmQnLFxuXHRcdFx0XHRtaW1lOiAnYXBwbGljYXRpb24veC1ibGVuZGVyJyxcblx0XHRcdH07XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuY2hlY2tTdHJpbmcoJyE8YXJjaD4nKSkge1xuXHRcdFx0YXdhaXQgdG9rZW5pemVyLmlnbm9yZSg4KTtcblx0XHRcdGNvbnN0IHN0cmluZyA9IGF3YWl0IHRva2VuaXplci5yZWFkVG9rZW4obmV3IFRva2VuLlN0cmluZ1R5cGUoMTMsICdhc2NpaScpKTtcblx0XHRcdGlmIChzdHJpbmcgPT09ICdkZWJpYW4tYmluYXJ5Jykge1xuXHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdGV4dDogJ2RlYicsXG5cdFx0XHRcdFx0bWltZTogJ2FwcGxpY2F0aW9uL3gtZGViJyxcblx0XHRcdFx0fTtcblx0XHRcdH1cblxuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0ZXh0OiAnYXInLFxuXHRcdFx0XHRtaW1lOiAnYXBwbGljYXRpb24veC11bml4LWFyY2hpdmUnLFxuXHRcdFx0fTtcblx0XHR9XG5cblx0XHRpZiAodGhpcy5jaGVja1N0cmluZygnKipBQ0UnLCB7b2Zmc2V0OiA3fSkpIHtcblx0XHRcdGF3YWl0IHRva2VuaXplci5wZWVrQnVmZmVyKHRoaXMuYnVmZmVyLCB7bGVuZ3RoOiAxNCwgbWF5QmVMZXNzOiB0cnVlfSk7XG5cdFx0XHRpZiAodGhpcy5jaGVja1N0cmluZygnKionLCB7b2Zmc2V0OiAxMn0pKSB7XG5cdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0ZXh0OiAnYWNlJyxcblx0XHRcdFx0XHRtaW1lOiAnYXBwbGljYXRpb24veC1hY2UtY29tcHJlc3NlZCcsXG5cdFx0XHRcdH07XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gLS0gOC1ieXRlIHNpZ25hdHVyZXMgLS1cblxuXHRcdGlmICh0aGlzLmNoZWNrKFsweDg5LCAweDUwLCAweDRFLCAweDQ3LCAweDBELCAweDBBLCAweDFBLCAweDBBXSkpIHtcblx0XHRcdC8vIEFQTkcgZm9ybWF0IChodHRwczovL3dpa2kubW96aWxsYS5vcmcvQVBOR19TcGVjaWZpY2F0aW9uKVxuXHRcdFx0Ly8gMS4gRmluZCB0aGUgZmlyc3QgSURBVCAoaW1hZ2UgZGF0YSkgY2h1bmsgKDQ5IDQ0IDQxIDU0KVxuXHRcdFx0Ly8gMi4gQ2hlY2sgaWYgdGhlcmUgaXMgYW4gXCJhY1RMXCIgY2h1bmsgYmVmb3JlIHRoZSBJREFUIG9uZSAoNjEgNjMgNTQgNEMpXG5cblx0XHRcdC8vIE9mZnNldCBjYWxjdWxhdGVkIGFzIGZvbGxvd3M6XG5cdFx0XHQvLyAtIDggYnl0ZXM6IFBORyBzaWduYXR1cmVcblx0XHRcdC8vIC0gNCAobGVuZ3RoKSArIDQgKGNodW5rIHR5cGUpICsgMTMgKGNodW5rIGRhdGEpICsgNCAoQ1JDKTogSUhEUiBjaHVua1xuXG5cdFx0XHRhd2FpdCB0b2tlbml6ZXIuaWdub3JlKDgpOyAvLyBpZ25vcmUgUE5HIHNpZ25hdHVyZVxuXG5cdFx0XHRhc3luYyBmdW5jdGlvbiByZWFkQ2h1bmtIZWFkZXIoKSB7XG5cdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0bGVuZ3RoOiBhd2FpdCB0b2tlbml6ZXIucmVhZFRva2VuKFRva2VuLklOVDMyX0JFKSxcblx0XHRcdFx0XHR0eXBlOiBhd2FpdCB0b2tlbml6ZXIucmVhZFRva2VuKG5ldyBUb2tlbi5TdHJpbmdUeXBlKDQsICdiaW5hcnknKSksXG5cdFx0XHRcdH07XG5cdFx0XHR9XG5cblx0XHRcdGRvIHtcblx0XHRcdFx0Y29uc3QgY2h1bmsgPSBhd2FpdCByZWFkQ2h1bmtIZWFkZXIoKTtcblx0XHRcdFx0aWYgKGNodW5rLmxlbmd0aCA8IDApIHtcblx0XHRcdFx0XHRyZXR1cm47IC8vIEludmFsaWQgY2h1bmsgbGVuZ3RoXG5cdFx0XHRcdH1cblxuXHRcdFx0XHRzd2l0Y2ggKGNodW5rLnR5cGUpIHtcblx0XHRcdFx0XHRjYXNlICdJREFUJzpcblx0XHRcdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0XHRcdGV4dDogJ3BuZycsXG5cdFx0XHRcdFx0XHRcdG1pbWU6ICdpbWFnZS9wbmcnLFxuXHRcdFx0XHRcdFx0fTtcblx0XHRcdFx0XHRjYXNlICdhY1RMJzpcblx0XHRcdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0XHRcdGV4dDogJ2FwbmcnLFxuXHRcdFx0XHRcdFx0XHRtaW1lOiAnaW1hZ2UvYXBuZycsXG5cdFx0XHRcdFx0XHR9O1xuXHRcdFx0XHRcdGRlZmF1bHQ6XG5cdFx0XHRcdFx0XHRhd2FpdCB0b2tlbml6ZXIuaWdub3JlKGNodW5rLmxlbmd0aCArIDQpOyAvLyBJZ25vcmUgY2h1bmstZGF0YSArIENSQ1xuXHRcdFx0XHR9XG5cdFx0XHR9IHdoaWxlICh0b2tlbml6ZXIucG9zaXRpb24gKyA4IDwgdG9rZW5pemVyLmZpbGVJbmZvLnNpemUpO1xuXG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRleHQ6ICdwbmcnLFxuXHRcdFx0XHRtaW1lOiAnaW1hZ2UvcG5nJyxcblx0XHRcdH07XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuY2hlY2soWzB4NDEsIDB4NTIsIDB4NTIsIDB4NEYsIDB4NTcsIDB4MzEsIDB4MDAsIDB4MDBdKSkge1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0ZXh0OiAnYXJyb3cnLFxuXHRcdFx0XHRtaW1lOiAnYXBwbGljYXRpb24veC1hcGFjaGUtYXJyb3cnLFxuXHRcdFx0fTtcblx0XHR9XG5cblx0XHRpZiAodGhpcy5jaGVjayhbMHg2NywgMHg2QywgMHg1NCwgMHg0NiwgMHgwMiwgMHgwMCwgMHgwMCwgMHgwMF0pKSB7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRleHQ6ICdnbGInLFxuXHRcdFx0XHRtaW1lOiAnbW9kZWwvZ2x0Zi1iaW5hcnknLFxuXHRcdFx0fTtcblx0XHR9XG5cblx0XHQvLyBgbW92YCBmb3JtYXQgdmFyaWFudHNcblx0XHRpZiAoXG5cdFx0XHR0aGlzLmNoZWNrKFsweDY2LCAweDcyLCAweDY1LCAweDY1XSwge29mZnNldDogNH0pIC8vIGBmcmVlYFxuXHRcdFx0fHwgdGhpcy5jaGVjayhbMHg2RCwgMHg2NCwgMHg2MSwgMHg3NF0sIHtvZmZzZXQ6IDR9KSAvLyBgbWRhdGAgTUpQRUdcblx0XHRcdHx8IHRoaXMuY2hlY2soWzB4NkQsIDB4NkYsIDB4NkYsIDB4NzZdLCB7b2Zmc2V0OiA0fSkgLy8gYG1vb3ZgXG5cdFx0XHR8fCB0aGlzLmNoZWNrKFsweDc3LCAweDY5LCAweDY0LCAweDY1XSwge29mZnNldDogNH0pIC8vIGB3aWRlYFxuXHRcdCkge1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0ZXh0OiAnbW92Jyxcblx0XHRcdFx0bWltZTogJ3ZpZGVvL3F1aWNrdGltZScsXG5cdFx0XHR9O1xuXHRcdH1cblxuXHRcdC8vIC0tIDktYnl0ZSBzaWduYXR1cmVzIC0tXG5cblx0XHRpZiAodGhpcy5jaGVjayhbMHg0OSwgMHg0OSwgMHg1MiwgMHg0RiwgMHgwOCwgMHgwMCwgMHgwMCwgMHgwMCwgMHgxOF0pKSB7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRleHQ6ICdvcmYnLFxuXHRcdFx0XHRtaW1lOiAnaW1hZ2UveC1vbHltcHVzLW9yZicsXG5cdFx0XHR9O1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLmNoZWNrU3RyaW5nKCdnaW1wIHhjZiAnKSkge1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0ZXh0OiAneGNmJyxcblx0XHRcdFx0bWltZTogJ2ltYWdlL3gteGNmJyxcblx0XHRcdH07XG5cdFx0fVxuXG5cdFx0Ly8gLS0gMTItYnl0ZSBzaWduYXR1cmVzIC0tXG5cblx0XHRpZiAodGhpcy5jaGVjayhbMHg0OSwgMHg0OSwgMHg1NSwgMHgwMCwgMHgxOCwgMHgwMCwgMHgwMCwgMHgwMCwgMHg4OCwgMHhFNywgMHg3NCwgMHhEOF0pKSB7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRleHQ6ICdydzInLFxuXHRcdFx0XHRtaW1lOiAnaW1hZ2UveC1wYW5hc29uaWMtcncyJyxcblx0XHRcdH07XG5cdFx0fVxuXG5cdFx0Ly8gQVNGX0hlYWRlcl9PYmplY3QgZmlyc3QgODAgYnl0ZXNcblx0XHRpZiAodGhpcy5jaGVjayhbMHgzMCwgMHgyNiwgMHhCMiwgMHg3NSwgMHg4RSwgMHg2NiwgMHhDRiwgMHgxMSwgMHhBNiwgMHhEOV0pKSB7XG5cdFx0XHRhc3luYyBmdW5jdGlvbiByZWFkSGVhZGVyKCkge1xuXHRcdFx0XHRjb25zdCBndWlkID0gQnVmZmVyLmFsbG9jKDE2KTtcblx0XHRcdFx0YXdhaXQgdG9rZW5pemVyLnJlYWRCdWZmZXIoZ3VpZCk7XG5cdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0aWQ6IGd1aWQsXG5cdFx0XHRcdFx0c2l6ZTogTnVtYmVyKGF3YWl0IHRva2VuaXplci5yZWFkVG9rZW4oVG9rZW4uVUlOVDY0X0xFKSksXG5cdFx0XHRcdH07XG5cdFx0XHR9XG5cblx0XHRcdGF3YWl0IHRva2VuaXplci5pZ25vcmUoMzApO1xuXHRcdFx0Ly8gU2VhcmNoIGZvciBoZWFkZXIgc2hvdWxkIGJlIGluIGZpcnN0IDFLQiBvZiBmaWxlLlxuXHRcdFx0d2hpbGUgKHRva2VuaXplci5wb3NpdGlvbiArIDI0IDwgdG9rZW5pemVyLmZpbGVJbmZvLnNpemUpIHtcblx0XHRcdFx0Y29uc3QgaGVhZGVyID0gYXdhaXQgcmVhZEhlYWRlcigpO1xuXHRcdFx0XHRsZXQgcGF5bG9hZCA9IGhlYWRlci5zaXplIC0gMjQ7XG5cdFx0XHRcdGlmIChfY2hlY2soaGVhZGVyLmlkLCBbMHg5MSwgMHgwNywgMHhEQywgMHhCNywgMHhCNywgMHhBOSwgMHhDRiwgMHgxMSwgMHg4RSwgMHhFNiwgMHgwMCwgMHhDMCwgMHgwQywgMHgyMCwgMHg1MywgMHg2NV0pKSB7XG5cdFx0XHRcdFx0Ly8gU3luYyBvbiBTdHJlYW0tUHJvcGVydGllcy1PYmplY3QgKEI3REMwNzkxLUE5QjctMTFDRi04RUU2LTAwQzAwQzIwNTM2NSlcblx0XHRcdFx0XHRjb25zdCB0eXBlSWQgPSBCdWZmZXIuYWxsb2MoMTYpO1xuXHRcdFx0XHRcdHBheWxvYWQgLT0gYXdhaXQgdG9rZW5pemVyLnJlYWRCdWZmZXIodHlwZUlkKTtcblxuXHRcdFx0XHRcdGlmIChfY2hlY2sodHlwZUlkLCBbMHg0MCwgMHg5RSwgMHg2OSwgMHhGOCwgMHg0RCwgMHg1QiwgMHhDRiwgMHgxMSwgMHhBOCwgMHhGRCwgMHgwMCwgMHg4MCwgMHg1RiwgMHg1QywgMHg0NCwgMHgyQl0pKSB7XG5cdFx0XHRcdFx0XHQvLyBGb3VuZCBhdWRpbzpcblx0XHRcdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0XHRcdGV4dDogJ2FzZicsXG5cdFx0XHRcdFx0XHRcdG1pbWU6ICdhdWRpby94LW1zLWFzZicsXG5cdFx0XHRcdFx0XHR9O1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdGlmIChfY2hlY2sodHlwZUlkLCBbMHhDMCwgMHhFRiwgMHgxOSwgMHhCQywgMHg0RCwgMHg1QiwgMHhDRiwgMHgxMSwgMHhBOCwgMHhGRCwgMHgwMCwgMHg4MCwgMHg1RiwgMHg1QywgMHg0NCwgMHgyQl0pKSB7XG5cdFx0XHRcdFx0XHQvLyBGb3VuZCB2aWRlbzpcblx0XHRcdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0XHRcdGV4dDogJ2FzZicsXG5cdFx0XHRcdFx0XHRcdG1pbWU6ICd2aWRlby94LW1zLWFzZicsXG5cdFx0XHRcdFx0XHR9O1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0YXdhaXQgdG9rZW5pemVyLmlnbm9yZShwYXlsb2FkKTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gRGVmYXVsdCB0byBBU0YgZ2VuZXJpYyBleHRlbnNpb25cblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdGV4dDogJ2FzZicsXG5cdFx0XHRcdG1pbWU6ICdhcHBsaWNhdGlvbi92bmQubXMtYXNmJyxcblx0XHRcdH07XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuY2hlY2soWzB4QUIsIDB4NEIsIDB4NTQsIDB4NTgsIDB4MjAsIDB4MzEsIDB4MzEsIDB4QkIsIDB4MEQsIDB4MEEsIDB4MUEsIDB4MEFdKSkge1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0ZXh0OiAna3R4Jyxcblx0XHRcdFx0bWltZTogJ2ltYWdlL2t0eCcsXG5cdFx0XHR9O1xuXHRcdH1cblxuXHRcdGlmICgodGhpcy5jaGVjayhbMHg3RSwgMHgxMCwgMHgwNF0pIHx8IHRoaXMuY2hlY2soWzB4N0UsIDB4MTgsIDB4MDRdKSkgJiYgdGhpcy5jaGVjayhbMHgzMCwgMHg0RCwgMHg0OSwgMHg0NV0sIHtvZmZzZXQ6IDR9KSkge1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0ZXh0OiAnbWllJyxcblx0XHRcdFx0bWltZTogJ2FwcGxpY2F0aW9uL3gtbWllJyxcblx0XHRcdH07XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuY2hlY2soWzB4MjcsIDB4MEEsIDB4MDAsIDB4MDAsIDB4MDAsIDB4MDAsIDB4MDAsIDB4MDAsIDB4MDAsIDB4MDAsIDB4MDAsIDB4MDBdLCB7b2Zmc2V0OiAyfSkpIHtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdGV4dDogJ3NocCcsXG5cdFx0XHRcdG1pbWU6ICdhcHBsaWNhdGlvbi94LWVzcmktc2hhcGUnLFxuXHRcdFx0fTtcblx0XHR9XG5cblx0XHRpZiAodGhpcy5jaGVjayhbMHhGRiwgMHg0RiwgMHhGRiwgMHg1MV0pKSB7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRleHQ6ICdqMmMnLFxuXHRcdFx0XHRtaW1lOiAnaW1hZ2UvajJjJyxcblx0XHRcdH07XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuY2hlY2soWzB4MDAsIDB4MDAsIDB4MDAsIDB4MEMsIDB4NkEsIDB4NTAsIDB4MjAsIDB4MjAsIDB4MEQsIDB4MEEsIDB4ODcsIDB4MEFdKSkge1xuXHRcdFx0Ly8gSlBFRy0yMDAwIGZhbWlseVxuXG5cdFx0XHRhd2FpdCB0b2tlbml6ZXIuaWdub3JlKDIwKTtcblx0XHRcdGNvbnN0IHR5cGUgPSBhd2FpdCB0b2tlbml6ZXIucmVhZFRva2VuKG5ldyBUb2tlbi5TdHJpbmdUeXBlKDQsICdhc2NpaScpKTtcblx0XHRcdHN3aXRjaCAodHlwZSkge1xuXHRcdFx0XHRjYXNlICdqcDIgJzpcblx0XHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdFx0ZXh0OiAnanAyJyxcblx0XHRcdFx0XHRcdG1pbWU6ICdpbWFnZS9qcDInLFxuXHRcdFx0XHRcdH07XG5cdFx0XHRcdGNhc2UgJ2pweCAnOlxuXHRcdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0XHRleHQ6ICdqcHgnLFxuXHRcdFx0XHRcdFx0bWltZTogJ2ltYWdlL2pweCcsXG5cdFx0XHRcdFx0fTtcblx0XHRcdFx0Y2FzZSAnanBtICc6XG5cdFx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRcdGV4dDogJ2pwbScsXG5cdFx0XHRcdFx0XHRtaW1lOiAnaW1hZ2UvanBtJyxcblx0XHRcdFx0XHR9O1xuXHRcdFx0XHRjYXNlICdtanAyJzpcblx0XHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdFx0ZXh0OiAnbWoyJyxcblx0XHRcdFx0XHRcdG1pbWU6ICdpbWFnZS9tajInLFxuXHRcdFx0XHRcdH07XG5cdFx0XHRcdGRlZmF1bHQ6XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmIChcblx0XHRcdHRoaXMuY2hlY2soWzB4RkYsIDB4MEFdKVxuXHRcdFx0fHwgdGhpcy5jaGVjayhbMHgwMCwgMHgwMCwgMHgwMCwgMHgwQywgMHg0QSwgMHg1OCwgMHg0QywgMHgyMCwgMHgwRCwgMHgwQSwgMHg4NywgMHgwQV0pXG5cdFx0KSB7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRleHQ6ICdqeGwnLFxuXHRcdFx0XHRtaW1lOiAnaW1hZ2UvanhsJyxcblx0XHRcdH07XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuY2hlY2soWzB4RkUsIDB4RkZdKSkgeyAvLyBVVEYtMTYtQk9NLUxFXG5cdFx0XHRpZiAodGhpcy5jaGVjayhbMCwgNjAsIDAsIDYzLCAwLCAxMjAsIDAsIDEwOSwgMCwgMTA4XSwge29mZnNldDogMn0pKSB7XG5cdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0ZXh0OiAneG1sJyxcblx0XHRcdFx0XHRtaW1lOiAnYXBwbGljYXRpb24veG1sJyxcblx0XHRcdFx0fTtcblx0XHRcdH1cblxuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDsgLy8gU29tZSB1bmtub3duIHRleHQgYmFzZWQgZm9ybWF0XG5cdFx0fVxuXG5cdFx0Ly8gLS0gVW5zYWZlIHNpZ25hdHVyZXMgLS1cblxuXHRcdGlmIChcblx0XHRcdHRoaXMuY2hlY2soWzB4MCwgMHgwLCAweDEsIDB4QkFdKVxuXHRcdFx0fHwgdGhpcy5jaGVjayhbMHgwLCAweDAsIDB4MSwgMHhCM10pXG5cdFx0KSB7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRleHQ6ICdtcGcnLFxuXHRcdFx0XHRtaW1lOiAndmlkZW8vbXBlZycsXG5cdFx0XHR9O1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLmNoZWNrKFsweDAwLCAweDAxLCAweDAwLCAweDAwLCAweDAwXSkpIHtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdGV4dDogJ3R0ZicsXG5cdFx0XHRcdG1pbWU6ICdmb250L3R0ZicsXG5cdFx0XHR9O1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLmNoZWNrKFsweDAwLCAweDAwLCAweDAxLCAweDAwXSkpIHtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdGV4dDogJ2ljbycsXG5cdFx0XHRcdG1pbWU6ICdpbWFnZS94LWljb24nLFxuXHRcdFx0fTtcblx0XHR9XG5cblx0XHRpZiAodGhpcy5jaGVjayhbMHgwMCwgMHgwMCwgMHgwMiwgMHgwMF0pKSB7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRleHQ6ICdjdXInLFxuXHRcdFx0XHRtaW1lOiAnaW1hZ2UveC1pY29uJyxcblx0XHRcdH07XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuY2hlY2soWzB4RDAsIDB4Q0YsIDB4MTEsIDB4RTAsIDB4QTEsIDB4QjEsIDB4MUEsIDB4RTFdKSkge1xuXHRcdFx0Ly8gRGV0ZWN0ZWQgTWljcm9zb2Z0IENvbXBvdW5kIEZpbGUgQmluYXJ5IEZpbGUgKE1TLUNGQikgRm9ybWF0LlxuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0ZXh0OiAnY2ZiJyxcblx0XHRcdFx0bWltZTogJ2FwcGxpY2F0aW9uL3gtY2ZiJyxcblx0XHRcdH07XG5cdFx0fVxuXG5cdFx0Ly8gSW5jcmVhc2Ugc2FtcGxlIHNpemUgZnJvbSAxMiB0byAyNTYuXG5cdFx0YXdhaXQgdG9rZW5pemVyLnBlZWtCdWZmZXIodGhpcy5idWZmZXIsIHtsZW5ndGg6IE1hdGgubWluKDI1NiwgdG9rZW5pemVyLmZpbGVJbmZvLnNpemUpLCBtYXlCZUxlc3M6IHRydWV9KTtcblxuXHRcdGlmICh0aGlzLmNoZWNrKFsweDYxLCAweDYzLCAweDczLCAweDcwXSwge29mZnNldDogMzZ9KSkge1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0ZXh0OiAnaWNjJyxcblx0XHRcdFx0bWltZTogJ2FwcGxpY2F0aW9uL3ZuZC5pY2Nwcm9maWxlJyxcblx0XHRcdH07XG5cdFx0fVxuXG5cdFx0Ly8gLS0gMTUtYnl0ZSBzaWduYXR1cmVzIC0tXG5cblx0XHRpZiAodGhpcy5jaGVja1N0cmluZygnQkVHSU46JykpIHtcblx0XHRcdGlmICh0aGlzLmNoZWNrU3RyaW5nKCdWQ0FSRCcsIHtvZmZzZXQ6IDZ9KSkge1xuXHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdGV4dDogJ3ZjZicsXG5cdFx0XHRcdFx0bWltZTogJ3RleHQvdmNhcmQnLFxuXHRcdFx0XHR9O1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAodGhpcy5jaGVja1N0cmluZygnVkNBTEVOREFSJywge29mZnNldDogNn0pKSB7XG5cdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0ZXh0OiAnaWNzJyxcblx0XHRcdFx0XHRtaW1lOiAndGV4dC9jYWxlbmRhcicsXG5cdFx0XHRcdH07XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gYHJhZmAgaXMgaGVyZSBqdXN0IHRvIGtlZXAgYWxsIHRoZSByYXcgaW1hZ2UgZGV0ZWN0b3JzIHRvZ2V0aGVyLlxuXHRcdGlmICh0aGlzLmNoZWNrU3RyaW5nKCdGVUpJRklMTUNDRC1SQVcnKSkge1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0ZXh0OiAncmFmJyxcblx0XHRcdFx0bWltZTogJ2ltYWdlL3gtZnVqaWZpbG0tcmFmJyxcblx0XHRcdH07XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuY2hlY2tTdHJpbmcoJ0V4dGVuZGVkIE1vZHVsZTonKSkge1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0ZXh0OiAneG0nLFxuXHRcdFx0XHRtaW1lOiAnYXVkaW8veC14bScsXG5cdFx0XHR9O1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLmNoZWNrU3RyaW5nKCdDcmVhdGl2ZSBWb2ljZSBGaWxlJykpIHtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdGV4dDogJ3ZvYycsXG5cdFx0XHRcdG1pbWU6ICdhdWRpby94LXZvYycsXG5cdFx0XHR9O1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLmNoZWNrKFsweDA0LCAweDAwLCAweDAwLCAweDAwXSkgJiYgdGhpcy5idWZmZXIubGVuZ3RoID49IDE2KSB7IC8vIFJvdWdoICYgcXVpY2sgY2hlY2sgUGlja2xlL0FTQVJcblx0XHRcdGNvbnN0IGpzb25TaXplID0gdGhpcy5idWZmZXIucmVhZFVJbnQzMkxFKDEyKTtcblx0XHRcdGlmIChqc29uU2l6ZSA+IDEyICYmIHRoaXMuYnVmZmVyLmxlbmd0aCA+PSBqc29uU2l6ZSArIDE2KSB7XG5cdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0Y29uc3QgaGVhZGVyID0gdGhpcy5idWZmZXIuc2xpY2UoMTYsIGpzb25TaXplICsgMTYpLnRvU3RyaW5nKCk7XG5cdFx0XHRcdFx0Y29uc3QganNvbiA9IEpTT04ucGFyc2UoaGVhZGVyKTtcblx0XHRcdFx0XHQvLyBDaGVjayBpZiBQaWNrbGUgaXMgQVNBUlxuXHRcdFx0XHRcdGlmIChqc29uLmZpbGVzKSB7IC8vIEZpbmFsIGNoZWNrLCBhc3N1cmluZyBQaWNrbGUvQVNBUiBmb3JtYXRcblx0XHRcdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0XHRcdGV4dDogJ2FzYXInLFxuXHRcdFx0XHRcdFx0XHRtaW1lOiAnYXBwbGljYXRpb24veC1hc2FyJyxcblx0XHRcdFx0XHRcdH07XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9IGNhdGNoIHt9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuY2hlY2soWzB4MDYsIDB4MEUsIDB4MkIsIDB4MzQsIDB4MDIsIDB4MDUsIDB4MDEsIDB4MDEsIDB4MEQsIDB4MDEsIDB4MDIsIDB4MDEsIDB4MDEsIDB4MDJdKSkge1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0ZXh0OiAnbXhmJyxcblx0XHRcdFx0bWltZTogJ2FwcGxpY2F0aW9uL214ZicsXG5cdFx0XHR9O1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLmNoZWNrU3RyaW5nKCdTQ1JNJywge29mZnNldDogNDR9KSkge1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0ZXh0OiAnczNtJyxcblx0XHRcdFx0bWltZTogJ2F1ZGlvL3gtczNtJyxcblx0XHRcdH07XG5cdFx0fVxuXG5cdFx0Ly8gUmF3IE1QRUctMiB0cmFuc3BvcnQgc3RyZWFtICgxODgtYnl0ZSBwYWNrZXRzKVxuXHRcdGlmICh0aGlzLmNoZWNrKFsweDQ3XSkgJiYgdGhpcy5jaGVjayhbMHg0N10sIHtvZmZzZXQ6IDE4OH0pKSB7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRleHQ6ICdtdHMnLFxuXHRcdFx0XHRtaW1lOiAndmlkZW8vbXAydCcsXG5cdFx0XHR9O1xuXHRcdH1cblxuXHRcdC8vIEJsdS1yYXkgRGlzYyBBdWRpby1WaWRlbyAoQkRBVikgTVBFRy0yIHRyYW5zcG9ydCBzdHJlYW0gaGFzIDQtYnl0ZSBUUF9leHRyYV9oZWFkZXIgYmVmb3JlIGVhY2ggMTg4LWJ5dGUgcGFja2V0XG5cdFx0aWYgKHRoaXMuY2hlY2soWzB4NDddLCB7b2Zmc2V0OiA0fSkgJiYgdGhpcy5jaGVjayhbMHg0N10sIHtvZmZzZXQ6IDE5Nn0pKSB7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRleHQ6ICdtdHMnLFxuXHRcdFx0XHRtaW1lOiAndmlkZW8vbXAydCcsXG5cdFx0XHR9O1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLmNoZWNrKFsweDQyLCAweDRGLCAweDRGLCAweDRCLCAweDRELCAweDRGLCAweDQyLCAweDQ5XSwge29mZnNldDogNjB9KSkge1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0ZXh0OiAnbW9iaScsXG5cdFx0XHRcdG1pbWU6ICdhcHBsaWNhdGlvbi94LW1vYmlwb2NrZXQtZWJvb2snLFxuXHRcdFx0fTtcblx0XHR9XG5cblx0XHRpZiAodGhpcy5jaGVjayhbMHg0NCwgMHg0OSwgMHg0MywgMHg0RF0sIHtvZmZzZXQ6IDEyOH0pKSB7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRleHQ6ICdkY20nLFxuXHRcdFx0XHRtaW1lOiAnYXBwbGljYXRpb24vZGljb20nLFxuXHRcdFx0fTtcblx0XHR9XG5cblx0XHRpZiAodGhpcy5jaGVjayhbMHg0QywgMHgwMCwgMHgwMCwgMHgwMCwgMHgwMSwgMHgxNCwgMHgwMiwgMHgwMCwgMHgwMCwgMHgwMCwgMHgwMCwgMHgwMCwgMHhDMCwgMHgwMCwgMHgwMCwgMHgwMCwgMHgwMCwgMHgwMCwgMHgwMCwgMHg0Nl0pKSB7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRleHQ6ICdsbmsnLFxuXHRcdFx0XHRtaW1lOiAnYXBwbGljYXRpb24veC5tcy5zaG9ydGN1dCcsIC8vIEludmVudGVkIGJ5IHVzXG5cdFx0XHR9O1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLmNoZWNrKFsweDYyLCAweDZGLCAweDZGLCAweDZCLCAweDAwLCAweDAwLCAweDAwLCAweDAwLCAweDZELCAweDYxLCAweDcyLCAweDZCLCAweDAwLCAweDAwLCAweDAwLCAweDAwXSkpIHtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdGV4dDogJ2FsaWFzJyxcblx0XHRcdFx0bWltZTogJ2FwcGxpY2F0aW9uL3guYXBwbGUuYWxpYXMnLCAvLyBJbnZlbnRlZCBieSB1c1xuXHRcdFx0fTtcblx0XHR9XG5cblx0XHRpZiAodGhpcy5jaGVja1N0cmluZygnS2F5ZGFyYSBGQlggQmluYXJ5ICBcXHUwMDAwJykpIHtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdGV4dDogJ2ZieCcsXG5cdFx0XHRcdG1pbWU6ICdhcHBsaWNhdGlvbi94LmF1dG9kZXNrLmZieCcsIC8vIEludmVudGVkIGJ5IHVzXG5cdFx0XHR9O1xuXHRcdH1cblxuXHRcdGlmIChcblx0XHRcdHRoaXMuY2hlY2soWzB4NEMsIDB4NTBdLCB7b2Zmc2V0OiAzNH0pXG5cdFx0XHQmJiAoXG5cdFx0XHRcdHRoaXMuY2hlY2soWzB4MDAsIDB4MDAsIDB4MDFdLCB7b2Zmc2V0OiA4fSlcblx0XHRcdFx0fHwgdGhpcy5jaGVjayhbMHgwMSwgMHgwMCwgMHgwMl0sIHtvZmZzZXQ6IDh9KVxuXHRcdFx0XHR8fCB0aGlzLmNoZWNrKFsweDAyLCAweDAwLCAweDAyXSwge29mZnNldDogOH0pXG5cdFx0XHQpXG5cdFx0KSB7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRleHQ6ICdlb3QnLFxuXHRcdFx0XHRtaW1lOiAnYXBwbGljYXRpb24vdm5kLm1zLWZvbnRvYmplY3QnLFxuXHRcdFx0fTtcblx0XHR9XG5cblx0XHRpZiAodGhpcy5jaGVjayhbMHgwNiwgMHgwNiwgMHhFRCwgMHhGNSwgMHhEOCwgMHgxRCwgMHg0NiwgMHhFNSwgMHhCRCwgMHgzMSwgMHhFRiwgMHhFNywgMHhGRSwgMHg3NCwgMHhCNywgMHgxRF0pKSB7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRleHQ6ICdpbmRkJyxcblx0XHRcdFx0bWltZTogJ2FwcGxpY2F0aW9uL3gtaW5kZXNpZ24nLFxuXHRcdFx0fTtcblx0XHR9XG5cblx0XHQvLyBJbmNyZWFzZSBzYW1wbGUgc2l6ZSBmcm9tIDI1NiB0byA1MTJcblx0XHRhd2FpdCB0b2tlbml6ZXIucGVla0J1ZmZlcih0aGlzLmJ1ZmZlciwge2xlbmd0aDogTWF0aC5taW4oNTEyLCB0b2tlbml6ZXIuZmlsZUluZm8uc2l6ZSksIG1heUJlTGVzczogdHJ1ZX0pO1xuXG5cdFx0Ly8gUmVxdWlyZXMgYSBidWZmZXIgc2l6ZSBvZiA1MTIgYnl0ZXNcblx0XHRpZiAodGFySGVhZGVyQ2hlY2tzdW1NYXRjaGVzKHRoaXMuYnVmZmVyKSkge1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0ZXh0OiAndGFyJyxcblx0XHRcdFx0bWltZTogJ2FwcGxpY2F0aW9uL3gtdGFyJyxcblx0XHRcdH07XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuY2hlY2soWzB4RkYsIDB4RkVdKSkgeyAvLyBVVEYtMTYtQk9NLUJFXG5cdFx0XHRpZiAodGhpcy5jaGVjayhbNjAsIDAsIDYzLCAwLCAxMjAsIDAsIDEwOSwgMCwgMTA4LCAwXSwge29mZnNldDogMn0pKSB7XG5cdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0ZXh0OiAneG1sJyxcblx0XHRcdFx0XHRtaW1lOiAnYXBwbGljYXRpb24veG1sJyxcblx0XHRcdFx0fTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKHRoaXMuY2hlY2soWzB4RkYsIDB4MEUsIDB4NTMsIDB4MDAsIDB4NkIsIDB4MDAsIDB4NjUsIDB4MDAsIDB4NzQsIDB4MDAsIDB4NjMsIDB4MDAsIDB4NjgsIDB4MDAsIDB4NTUsIDB4MDAsIDB4NzAsIDB4MDAsIDB4MjAsIDB4MDAsIDB4NEQsIDB4MDAsIDB4NkYsIDB4MDAsIDB4NjQsIDB4MDAsIDB4NjUsIDB4MDAsIDB4NkMsIDB4MDBdLCB7b2Zmc2V0OiAyfSkpIHtcblx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRleHQ6ICdza3AnLFxuXHRcdFx0XHRcdG1pbWU6ICdhcHBsaWNhdGlvbi92bmQuc2tldGNodXAuc2twJyxcblx0XHRcdFx0fTtcblx0XHRcdH1cblxuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDsgLy8gU29tZSB0ZXh0IGJhc2VkIGZvcm1hdFxuXHRcdH1cblxuXHRcdGlmICh0aGlzLmNoZWNrU3RyaW5nKCctLS0tLUJFR0lOIFBHUCBNRVNTQUdFLS0tLS0nKSkge1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0ZXh0OiAncGdwJyxcblx0XHRcdFx0bWltZTogJ2FwcGxpY2F0aW9uL3BncC1lbmNyeXB0ZWQnLFxuXHRcdFx0fTtcblx0XHR9XG5cblx0XHQvLyBDaGVjayBNUEVHIDEgb3IgMiBMYXllciAzIGhlYWRlciwgb3IgJ2xheWVyIDAnIGZvciBBRFRTIChNUEVHIHN5bmMtd29yZCAweEZGRSlcblx0XHRpZiAodGhpcy5idWZmZXIubGVuZ3RoID49IDIgJiYgdGhpcy5jaGVjayhbMHhGRiwgMHhFMF0sIHtvZmZzZXQ6IDAsIG1hc2s6IFsweEZGLCAweEUwXX0pKSB7XG5cdFx0XHRpZiAodGhpcy5jaGVjayhbMHgxMF0sIHtvZmZzZXQ6IDEsIG1hc2s6IFsweDE2XX0pKSB7XG5cdFx0XHRcdC8vIENoZWNrIGZvciAoQURUUykgTVBFRy0yXG5cdFx0XHRcdGlmICh0aGlzLmNoZWNrKFsweDA4XSwge29mZnNldDogMSwgbWFzazogWzB4MDhdfSkpIHtcblx0XHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdFx0ZXh0OiAnYWFjJyxcblx0XHRcdFx0XHRcdG1pbWU6ICdhdWRpby9hYWMnLFxuXHRcdFx0XHRcdH07XG5cdFx0XHRcdH1cblxuXHRcdFx0XHQvLyBNdXN0IGJlIChBRFRTKSBNUEVHLTRcblx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRleHQ6ICdhYWMnLFxuXHRcdFx0XHRcdG1pbWU6ICdhdWRpby9hYWMnLFxuXHRcdFx0XHR9O1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBNUEVHIDEgb3IgMiBMYXllciAzIGhlYWRlclxuXHRcdFx0Ly8gQ2hlY2sgZm9yIE1QRUcgbGF5ZXIgM1xuXHRcdFx0aWYgKHRoaXMuY2hlY2soWzB4MDJdLCB7b2Zmc2V0OiAxLCBtYXNrOiBbMHgwNl19KSkge1xuXHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdGV4dDogJ21wMycsXG5cdFx0XHRcdFx0bWltZTogJ2F1ZGlvL21wZWcnLFxuXHRcdFx0XHR9O1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBDaGVjayBmb3IgTVBFRyBsYXllciAyXG5cdFx0XHRpZiAodGhpcy5jaGVjayhbMHgwNF0sIHtvZmZzZXQ6IDEsIG1hc2s6IFsweDA2XX0pKSB7XG5cdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0ZXh0OiAnbXAyJyxcblx0XHRcdFx0XHRtaW1lOiAnYXVkaW8vbXBlZycsXG5cdFx0XHRcdH07XG5cdFx0XHR9XG5cblx0XHRcdC8vIENoZWNrIGZvciBNUEVHIGxheWVyIDFcblx0XHRcdGlmICh0aGlzLmNoZWNrKFsweDA2XSwge29mZnNldDogMSwgbWFzazogWzB4MDZdfSkpIHtcblx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRleHQ6ICdtcDEnLFxuXHRcdFx0XHRcdG1pbWU6ICdhdWRpby9tcGVnJyxcblx0XHRcdFx0fTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRhc3luYyByZWFkVGlmZlRhZyhiaWdFbmRpYW4pIHtcblx0XHRjb25zdCB0YWdJZCA9IGF3YWl0IHRoaXMudG9rZW5pemVyLnJlYWRUb2tlbihiaWdFbmRpYW4gPyBUb2tlbi5VSU5UMTZfQkUgOiBUb2tlbi5VSU5UMTZfTEUpO1xuXHRcdHRoaXMudG9rZW5pemVyLmlnbm9yZSgxMCk7XG5cdFx0c3dpdGNoICh0YWdJZCkge1xuXHRcdFx0Y2FzZSA1MF8zNDE6XG5cdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0ZXh0OiAnYXJ3Jyxcblx0XHRcdFx0XHRtaW1lOiAnaW1hZ2UveC1zb255LWFydycsXG5cdFx0XHRcdH07XG5cdFx0XHRjYXNlIDUwXzcwNjpcblx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRleHQ6ICdkbmcnLFxuXHRcdFx0XHRcdG1pbWU6ICdpbWFnZS94LWFkb2JlLWRuZycsXG5cdFx0XHRcdH07XG5cdFx0XHRkZWZhdWx0OlxuXHRcdH1cblx0fVxuXG5cdGFzeW5jIHJlYWRUaWZmSUZEKGJpZ0VuZGlhbikge1xuXHRcdGNvbnN0IG51bWJlck9mVGFncyA9IGF3YWl0IHRoaXMudG9rZW5pemVyLnJlYWRUb2tlbihiaWdFbmRpYW4gPyBUb2tlbi5VSU5UMTZfQkUgOiBUb2tlbi5VSU5UMTZfTEUpO1xuXHRcdGZvciAobGV0IG4gPSAwOyBuIDwgbnVtYmVyT2ZUYWdzOyArK24pIHtcblx0XHRcdGNvbnN0IGZpbGVUeXBlID0gYXdhaXQgdGhpcy5yZWFkVGlmZlRhZyhiaWdFbmRpYW4pO1xuXHRcdFx0aWYgKGZpbGVUeXBlKSB7XG5cdFx0XHRcdHJldHVybiBmaWxlVHlwZTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRhc3luYyByZWFkVGlmZkhlYWRlcihiaWdFbmRpYW4pIHtcblx0XHRjb25zdCB2ZXJzaW9uID0gKGJpZ0VuZGlhbiA/IFRva2VuLlVJTlQxNl9CRSA6IFRva2VuLlVJTlQxNl9MRSkuZ2V0KHRoaXMuYnVmZmVyLCAyKTtcblx0XHRjb25zdCBpZmRPZmZzZXQgPSAoYmlnRW5kaWFuID8gVG9rZW4uVUlOVDMyX0JFIDogVG9rZW4uVUlOVDMyX0xFKS5nZXQodGhpcy5idWZmZXIsIDQpO1xuXG5cdFx0aWYgKHZlcnNpb24gPT09IDQyKSB7XG5cdFx0XHQvLyBUSUZGIGZpbGUgaGVhZGVyXG5cdFx0XHRpZiAoaWZkT2Zmc2V0ID49IDYpIHtcblx0XHRcdFx0aWYgKHRoaXMuY2hlY2tTdHJpbmcoJ0NSJywge29mZnNldDogOH0pKSB7XG5cdFx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRcdGV4dDogJ2NyMicsXG5cdFx0XHRcdFx0XHRtaW1lOiAnaW1hZ2UveC1jYW5vbi1jcjInLFxuXHRcdFx0XHRcdH07XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRpZiAoaWZkT2Zmc2V0ID49IDggJiYgKHRoaXMuY2hlY2soWzB4MUMsIDB4MDAsIDB4RkUsIDB4MDBdLCB7b2Zmc2V0OiA4fSkgfHwgdGhpcy5jaGVjayhbMHgxRiwgMHgwMCwgMHgwQiwgMHgwMF0sIHtvZmZzZXQ6IDh9KSkpIHtcblx0XHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdFx0ZXh0OiAnbmVmJyxcblx0XHRcdFx0XHRcdG1pbWU6ICdpbWFnZS94LW5pa29uLW5lZicsXG5cdFx0XHRcdFx0fTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRhd2FpdCB0aGlzLnRva2VuaXplci5pZ25vcmUoaWZkT2Zmc2V0KTtcblx0XHRcdGNvbnN0IGZpbGVUeXBlID0gYXdhaXQgdGhpcy5yZWFkVGlmZklGRChiaWdFbmRpYW4pO1xuXHRcdFx0cmV0dXJuIGZpbGVUeXBlID8/IHtcblx0XHRcdFx0ZXh0OiAndGlmJyxcblx0XHRcdFx0bWltZTogJ2ltYWdlL3RpZmYnLFxuXHRcdFx0fTtcblx0XHR9XG5cblx0XHRpZiAodmVyc2lvbiA9PT0gNDMpIHtcdC8vIEJpZyBUSUZGIGZpbGUgaGVhZGVyXG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRleHQ6ICd0aWYnLFxuXHRcdFx0XHRtaW1lOiAnaW1hZ2UvdGlmZicsXG5cdFx0XHR9O1xuXHRcdH1cblx0fVxufVxuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gZmlsZVR5cGVTdHJlYW0ocmVhZGFibGVTdHJlYW0sIG9wdGlvbnMgPSB7fSkge1xuXHRyZXR1cm4gbmV3IEZpbGVUeXBlUGFyc2VyKCkudG9EZXRlY3Rpb25TdHJlYW0ocmVhZGFibGVTdHJlYW0sIG9wdGlvbnMpO1xufVxuXG5leHBvcnQgY29uc3Qgc3VwcG9ydGVkRXh0ZW5zaW9ucyA9IG5ldyBTZXQoZXh0ZW5zaW9ucyk7XG5leHBvcnQgY29uc3Qgc3VwcG9ydGVkTWltZVR5cGVzID0gbmV3IFNldChtaW1lVHlwZXMpO1xuIiwiaW1wb3J0IHtmaWxlVHlwZUZyb21CdWZmZXJ9IGZyb20gJ2ZpbGUtdHlwZSc7XG5cbmNvbnN0IGltYWdlRXh0ZW5zaW9ucyA9IG5ldyBTZXQoW1xuXHQnanBnJyxcblx0J3BuZycsXG5cdCdnaWYnLFxuXHQnd2VicCcsXG5cdCdmbGlmJyxcblx0J2NyMicsXG5cdCd0aWYnLFxuXHQnYm1wJyxcblx0J2p4cicsXG5cdCdwc2QnLFxuXHQnaWNvJyxcblx0J2JwZycsXG5cdCdqcDInLFxuXHQnanBtJyxcblx0J2pweCcsXG5cdCdoZWljJyxcblx0J2N1cicsXG5cdCdkY20nLFxuXHQnYXZpZicsXG5dKTtcblxuZXhwb3J0IGRlZmF1bHQgYXN5bmMgZnVuY3Rpb24gaW1hZ2VUeXBlKGlucHV0KSB7XG5cdGNvbnN0IHJlc3VsdCA9IGF3YWl0IGZpbGVUeXBlRnJvbUJ1ZmZlcihpbnB1dCk7XG5cdHJldHVybiBpbWFnZUV4dGVuc2lvbnMuaGFzKHJlc3VsdD8uZXh0KSAmJiByZXN1bHQ7XG59XG5cbmV4cG9ydCBjb25zdCBtaW5pbXVtQnl0ZXMgPSA0MTAwO1xuIiwiLy8g2KfZhNi52LHYqNmK2KlcclxuXHJcbmV4cG9ydCBkZWZhdWx0IHt9O1xyXG4iLCIvLyDEjWXFoXRpbmFcclxuXHJcbmV4cG9ydCBkZWZhdWx0IHt9O1xyXG4iLCIvLyBEYW5za1xyXG5cclxuZXhwb3J0IGRlZmF1bHQge307XHJcbiIsIi8vIERldXRzY2hcclxuXHJcbmV4cG9ydCBkZWZhdWx0IHt9OyIsIi8vIEVuZ2xpc2hcclxuXHJcbmV4cG9ydCBkZWZhdWx0IHtcclxuICAvLyBzZXR0aW5nLnRzXHJcbiAgXCJQbHVnaW4gU2V0dGluZ3NcIjogXCJQbHVnaW4gU2V0dGluZ3NcIixcclxuICBcIkF1dG8gcGFzdGVkIHVwbG9hZFwiOiBcIkF1dG8gcGFzdGVkIHVwbG9hZFwiLFxyXG4gIFwiSWYgeW91IHNldCB0aGlzIHZhbHVlIHRydWUsIHdoZW4geW91IHBhc3RlIGltYWdlLCBpdCB3aWxsIGJlIGF1dG8gdXBsb2FkZWQoeW91IHNob3VsZCBzZXQgdGhlIHBpY0dvIHNlcnZlciByaWdodGx5KVwiOlxyXG4gICAgXCJJZiB5b3Ugc2V0IHRoaXMgdmFsdWUgdHJ1ZSwgd2hlbiB5b3UgcGFzdGUgaW1hZ2UsIGl0IHdpbGwgYmUgYXV0byB1cGxvYWRlZCh5b3Ugc2hvdWxkIHNldCB0aGUgcGljR28gc2VydmVyIHJpZ2h0bHkpXCIsXHJcbiAgXCJEZWZhdWx0IHVwbG9hZGVyXCI6IFwiRGVmYXVsdCB1cGxvYWRlclwiLFxyXG4gIFwiUGljR28gc2VydmVyXCI6IFwiUGljR28gc2VydmVyIHVwbG9hZCByb3V0ZVwiLFxyXG4gIFwiUGljR28gc2VydmVyIGRlc2NcIjpcclxuICAgIFwidXBsb2FkIHJvdXRlLCB1c2UgUGljTGlzdCB3aWxsIGJlIGFibGUgdG8gc2V0IHBpY2JlZCBhbmQgY29uZmlnIHRocm91Z2ggcXVlcnlcIixcclxuICBcIlBsZWFzZSBpbnB1dCBQaWNHbyBzZXJ2ZXJcIjogXCJQbGVhc2UgaW5wdXQgdXBsb2FkIHJvdXRlXCIsXHJcbiAgXCJQaWNHbyBkZWxldGUgc2VydmVyXCI6XHJcbiAgICBcIlBpY0dvIHNlcnZlciBkZWxldGUgcm91dGUoeW91IG5lZWQgdG8gdXNlIFBpY0xpc3QgYXBwKVwiLFxyXG4gIFwiUGljTGlzdCBkZXNjXCI6IFwiU2VhcmNoIFBpY0xpc3Qgb24gR2l0aHViIHRvIGRvd25sb2FkIGFuZCBpbnN0YWxsXCIsXHJcbiAgXCJQbGVhc2UgaW5wdXQgUGljR28gZGVsZXRlIHNlcnZlclwiOiBcIlBsZWFzZSBpbnB1dCBkZWxldGUgc2VydmVyXCIsXHJcbiAgXCJEZWxldGUgaW1hZ2UgdXNpbmcgUGljTGlzdFwiOiBcIkRlbGV0ZSBpbWFnZSB1c2luZyBQaWNMaXN0XCIsXHJcbiAgXCJQaWNHby1Db3JlIHBhdGhcIjogXCJQaWNHby1Db3JlIHBhdGhcIixcclxuICBcIkRlbGV0ZSBzdWNjZXNzZnVsbHlcIjogXCJEZWxldGUgc3VjY2Vzc2Z1bGx5XCIsXHJcbiAgXCJEZWxldGUgZmFpbGVkXCI6IFwiRGVsZXRlIGZhaWxlZFwiLFxyXG4gIFwiSW1hZ2Ugc2l6ZSBzdWZmaXhcIjogXCJJbWFnZSBzaXplIHN1ZmZpeFwiLFxyXG4gIFwiSW1hZ2Ugc2l6ZSBzdWZmaXggRGVzY3JpcHRpb25cIjogXCJsaWtlIHwzMDAgZm9yIHJlc2l6ZSBpbWFnZSBpbiBvYi5cIixcclxuICBcIlBsZWFzZSBpbnB1dCBpbWFnZSBzaXplIHN1ZmZpeFwiOiBcIlBsZWFzZSBpbnB1dCBpbWFnZSBzaXplIHN1ZmZpeFwiLFxyXG4gIFwiRXJyb3IsIGNvdWxkIG5vdCBkZWxldGVcIjogXCJFcnJvciwgY291bGQgbm90IGRlbGV0ZVwiLFxyXG4gIFwiUGxlYXNlIGlucHV0IFBpY0dvLUNvcmUgcGF0aCwgZGVmYXVsdCB1c2luZyBlbnZpcm9ubWVudCB2YXJpYWJsZXNcIjpcclxuICAgIFwiUGxlYXNlIGlucHV0IFBpY0dvLUNvcmUgcGF0aCwgZGVmYXVsdCB1c2luZyBlbnZpcm9ubWVudCB2YXJpYWJsZXNcIixcclxuICBcIldvcmsgb24gbmV0d29ya1wiOiBcIldvcmsgb24gbmV0d29ya1wiLFxyXG4gIFwiV29yayBvbiBuZXR3b3JrIERlc2NyaXB0aW9uXCI6XHJcbiAgICBcIkFsbG93IHVwbG9hZCBuZXR3b3JrIGltYWdlIGJ5ICdVcGxvYWQgYWxsJyBjb21tYW5kLlxcbiBPciB3aGVuIHlvdSBwYXN0ZSwgbWQgc3RhbmRhcmQgaW1hZ2UgbGluayBpbiB5b3VyIGNsaXBib2FyZCB3aWxsIGJlIGF1dG8gdXBsb2FkLlwiLFxyXG4gIFwiVXBsb2FkIHdoZW4gY2xpcGJvYXJkIGhhcyBpbWFnZSBhbmQgdGV4dCB0b2dldGhlclwiOlxyXG4gICAgXCJVcGxvYWQgd2hlbiBjbGlwYm9hcmQgaGFzIGltYWdlIGFuZCB0ZXh0IHRvZ2V0aGVyXCIsXHJcbiAgXCJXaGVuIHlvdSBjb3B5LCBzb21lIGFwcGxpY2F0aW9uIGxpa2UgRXhjZWwgd2lsbCBpbWFnZSBhbmQgdGV4dCB0byBjbGlwYm9hcmQsIHlvdSBjYW4gdXBsb2FkIG9yIG5vdC5cIjpcclxuICAgIFwiV2hlbiB5b3UgY29weSwgc29tZSBhcHBsaWNhdGlvbiBsaWtlIEV4Y2VsIHdpbGwgaW1hZ2UgYW5kIHRleHQgdG8gY2xpcGJvYXJkLCB5b3UgY2FuIHVwbG9hZCBvciBub3QuXCIsXHJcbiAgXCJOZXR3b3JrIERvbWFpbiBCbGFjayBMaXN0XCI6IFwiTmV0d29yayBEb21haW4gQmxhY2sgTGlzdFwiLFxyXG4gIFwiTmV0d29yayBEb21haW4gQmxhY2sgTGlzdCBEZXNjcmlwdGlvblwiOlxyXG4gICAgXCJJbWFnZSBpbiB0aGUgZG9tYWluIGxpc3Qgd2lsbCBub3QgYmUgdXBsb2FkLHVzZSBjb21tYSBzZXBhcmF0ZWRcIixcclxuICBcIkRlbGV0ZSBzb3VyY2UgZmlsZSBhZnRlciB5b3UgdXBsb2FkIGZpbGVcIjpcclxuICAgIFwiRGVsZXRlIHNvdXJjZSBmaWxlIGFmdGVyIHlvdSB1cGxvYWQgZmlsZVwiLFxyXG4gIFwiRGVsZXRlIHNvdXJjZSBmaWxlIGluIG9iIGFzc2V0cyBhZnRlciB5b3UgdXBsb2FkIGZpbGUuXCI6XHJcbiAgICBcIkRlbGV0ZSBzb3VyY2UgZmlsZSBpbiBvYiBhc3NldHMgYWZ0ZXIgeW91IHVwbG9hZCBmaWxlLlwiLFxyXG4gIFwiSW1hZ2UgZGVzY1wiOiBcIkltYWdlIGRlc2NcIixcclxuICByZXNlcnZlOiBcImRlZmF1bHRcIixcclxuICBcInJlbW92ZSBhbGxcIjogXCJub25lXCIsXHJcbiAgXCJyZW1vdmUgZGVmYXVsdFwiOiBcInJlbW92ZSBpbWFnZS5wbmdcIixcclxuICBcIlJlbW90ZSBzZXJ2ZXIgbW9kZVwiOiBcIlJlbW90ZSBzZXJ2ZXIgbW9kZVwiLFxyXG4gIFwiUmVtb3RlIHNlcnZlciBtb2RlIGRlc2NcIjpcclxuICAgIFwiSWYgeW91IGhhdmUgZGVwbG95ZWQgcGljbGlzdC1jb3JlIG9yIHBpY2xpc3Qgb24gdGhlIHNlcnZlci5cIixcclxuICBcIkNhbiBub3QgZmluZCBpbWFnZSBmaWxlXCI6IFwiQ2FuIG5vdCBmaW5kIGltYWdlIGZpbGVcIixcclxuICBcIkZpbGUgaGFzIGJlZW4gY2hhbmdlZGQsIHVwbG9hZCBmYWlsdXJlXCI6XHJcbiAgICBcIkZpbGUgaGFzIGJlZW4gY2hhbmdlZGQsIHVwbG9hZCBmYWlsdXJlXCIsXHJcbiAgXCJGaWxlIGhhcyBiZWVuIGNoYW5nZWRkLCBkb3dubG9hZCBmYWlsdXJlXCI6XHJcbiAgICBcIkZpbGUgaGFzIGJlZW4gY2hhbmdlZGQsIGRvd25sb2FkIGZhaWx1cmVcIixcclxuICBcIldhcm5pbmc6IHVwbG9hZCBmaWxlcyBpcyBkaWZmZXJlbnQgb2YgcmVjaXZlciBmaWxlcyBmcm9tIGFwaVwiOlxyXG4gICAgXCJXYXJuaW5nOiB1cGxvYWQgZmlsZXMgbnVtIGlzIGRpZmZlcmVudCBvZiByZWNpdmVyIGZpbGVzIGZyb20gYXBpXCIsXHJcbiAgdXBsb2FkOiBcIlVwbG9hZFwiLFxyXG59O1xyXG4iLCIvLyBCcml0aXNoIEVuZ2xpc2hcclxuXHJcbmV4cG9ydCBkZWZhdWx0IHt9O1xyXG4iLCIvLyBFc3Bhw7FvbFxyXG5cclxuZXhwb3J0IGRlZmF1bHQge307XHJcbiIsIi8vIGZyYW7Dp2Fpc1xyXG5cclxuZXhwb3J0IGRlZmF1bHQge307XHJcbiIsIi8vIOCkueCkv+CkqOCljeCkpuClgFxyXG5cclxuZXhwb3J0IGRlZmF1bHQge307XHJcbiIsIi8vIEJhaGFzYSBJbmRvbmVzaWFcclxuXHJcbmV4cG9ydCBkZWZhdWx0IHt9O1xyXG4iLCIvLyBJdGFsaWFub1xyXG5cclxuZXhwb3J0IGRlZmF1bHQge307XHJcbiIsIi8vIOaXpeacrOiqnlxyXG5cclxuZXhwb3J0IGRlZmF1bHQge307IiwiLy8g7ZWc6rWt7Ja0XHJcblxyXG5leHBvcnQgZGVmYXVsdCB7fTtcclxuIiwiLy8gTmVkZXJsYW5kc1xyXG5cclxuZXhwb3J0IGRlZmF1bHQge307XHJcbiIsIi8vIE5vcnNrXHJcblxyXG5leHBvcnQgZGVmYXVsdCB7fTtcclxuIiwiLy8gasSZenlrIHBvbHNraVxyXG5cclxuZXhwb3J0IGRlZmF1bHQge307XHJcbiIsIi8vIFBvcnR1Z3XDqnNcclxuXHJcbmV4cG9ydCBkZWZhdWx0IHt9O1xyXG4iLCIvLyBQb3J0dWd1w6pzIGRvIEJyYXNpbFxyXG4vLyBCcmF6aWxpYW4gUG9ydHVndWVzZVxyXG5cclxuZXhwb3J0IGRlZmF1bHQge307IiwiLy8gUm9tw6JuxINcclxuXHJcbmV4cG9ydCBkZWZhdWx0IHt9O1xyXG4iLCIvLyDRgNGD0YHRgdC60LjQuVxyXG5cclxuZXhwb3J0IGRlZmF1bHQge307XHJcbiIsIi8vIFTDvHJrw6dlXHJcblxyXG5leHBvcnQgZGVmYXVsdCB7fTtcclxuIiwiLy8g566A5L2T5Lit5paHXHJcblxyXG5leHBvcnQgZGVmYXVsdCB7XHJcbiAgLy8gc2V0dGluZy50c1xyXG4gIFwiUGx1Z2luIFNldHRpbmdzXCI6IFwi5o+S5Lu26K6+572uXCIsXHJcbiAgXCJBdXRvIHBhc3RlZCB1cGxvYWRcIjogXCLliarliIfmnb/oh6rliqjkuIrkvKBcIixcclxuICBcIklmIHlvdSBzZXQgdGhpcyB2YWx1ZSB0cnVlLCB3aGVuIHlvdSBwYXN0ZSBpbWFnZSwgaXQgd2lsbCBiZSBhdXRvIHVwbG9hZGVkKHlvdSBzaG91bGQgc2V0IHRoZSBwaWNHbyBzZXJ2ZXIgcmlnaHRseSlcIjpcclxuICAgIFwi5ZCv55So6K+l6YCJ6aG55ZCO77yM6buP6LS05Zu+54mH5pe25Lya6Ieq5Yqo5LiK5Lyg77yI5L2g6ZyA6KaB5q2j56Gu6YWN572ucGljZ2/vvIlcIixcclxuICBcIkRlZmF1bHQgdXBsb2FkZXJcIjogXCLpu5jorqTkuIrkvKDlmahcIixcclxuICBcIlBpY0dvIHNlcnZlclwiOiBcIlBpY0dvIHNlcnZlciDkuIrkvKDmjqXlj6NcIixcclxuICBcIlBpY0dvIHNlcnZlciBkZXNjXCI6IFwi5LiK5Lyg5o6l5Y+j77yM5L2/55SoUGljTGlzdOaXtuWPr+mAmui/h+iuvue9rlVSTOWPguaVsOaMh+WumuWbvuW6iuWSjOmFjee9rlwiLFxyXG4gIFwiUGxlYXNlIGlucHV0IFBpY0dvIHNlcnZlclwiOiBcIuivt+i+k+WFpeS4iuS8oOaOpeWPo+WcsOWdgFwiLFxyXG4gIFwiUGljR28gZGVsZXRlIHNlcnZlclwiOiBcIlBpY0dvIHNlcnZlciDliKDpmaTmjqXlj6Mo6K+35L2/55SoUGljTGlzdOadpeWQr+eUqOatpOWKn+iDvSlcIixcclxuICBcIlBpY0xpc3QgZGVzY1wiOiBcIlBpY0xpc3TmmK9QaWNHb+S6jOasoeW8gOWPkeeJiO+8jOivt0dpdGh1YuaQnOe0olBpY0xpc3TkuIvovb1cIixcclxuICBcIlBsZWFzZSBpbnB1dCBQaWNHbyBkZWxldGUgc2VydmVyXCI6IFwi6K+36L6T5YWl5Yig6Zmk5o6l5Y+j5Zyw5Z2AXCIsXHJcbiAgXCJEZWxldGUgaW1hZ2UgdXNpbmcgUGljTGlzdFwiOiBcIuS9v+eUqCBQaWNMaXN0IOWIoOmZpOWbvueJh1wiLFxyXG4gIFwiUGljR28tQ29yZSBwYXRoXCI6IFwiUGljR28tQ29yZSDot6/lvoRcIixcclxuICBcIkRlbGV0ZSBzdWNjZXNzZnVsbHlcIjogXCLliKDpmaTmiJDlip9cIixcclxuICBcIkRlbGV0ZSBmYWlsZWRcIjogXCLliKDpmaTlpLHotKVcIixcclxuICBcIkVycm9yLCBjb3VsZCBub3QgZGVsZXRlXCI6IFwi6ZSZ6K+v77yM5peg5rOV5Yig6ZmkXCIsXHJcbiAgXCJJbWFnZSBzaXplIHN1ZmZpeFwiOiBcIuWbvueJh+Wkp+Wwj+WQjue8gFwiLFxyXG4gIFwiSW1hZ2Ugc2l6ZSBzdWZmaXggRGVzY3JpcHRpb25cIjogXCLmr5TlpoLvvJp8MzAwIOeUqOS6juiwg+aVtOWbvueJh+Wkp+Wwj1wiLFxyXG4gIFwiUGxlYXNlIGlucHV0IGltYWdlIHNpemUgc3VmZml4XCI6IFwi6K+36L6T5YWl5Zu+54mH5aSn5bCP5ZCO57yAXCIsXHJcbiAgXCJQbGVhc2UgaW5wdXQgUGljR28tQ29yZSBwYXRoLCBkZWZhdWx0IHVzaW5nIGVudmlyb25tZW50IHZhcmlhYmxlc1wiOlxyXG4gICAgXCLor7fovpPlhaUgUGljR28tQ29yZSBwYXRo77yM6buY6K6k5L2/55So546v5aKD5Y+Y6YePXCIsXHJcbiAgXCJXb3JrIG9uIG5ldHdvcmtcIjogXCLlupTnlKjnvZHnu5zlm77niYdcIixcclxuICBcIldvcmsgb24gbmV0d29yayBEZXNjcmlwdGlvblwiOlxyXG4gICAgXCLlvZPkvaDkuIrkvKDmiYDmnInlm77niYfml7bvvIzkuZ/kvJrkuIrkvKDnvZHnu5zlm77niYfjgILku6Xlj4rlvZPkvaDov5vooYzpu4/otLTml7bvvIzliarliIfmnb/kuK3nmoTmoIflh4YgbWQg5Zu+54mH5Lya6KKr5LiK5LygXCIsXHJcbiAgXCJVcGxvYWQgd2hlbiBjbGlwYm9hcmQgaGFzIGltYWdlIGFuZCB0ZXh0IHRvZ2V0aGVyXCI6XHJcbiAgICBcIuW9k+WJquWIh+adv+WQjOaXtuaLpeacieaWh+acrOWSjOWbvueJh+WJquWIh+adv+aVsOaNruaXtuaYr+WQpuS4iuS8oOWbvueJh1wiLFxyXG4gIFwiV2hlbiB5b3UgY29weSwgc29tZSBhcHBsaWNhdGlvbiBsaWtlIEV4Y2VsIHdpbGwgaW1hZ2UgYW5kIHRleHQgdG8gY2xpcGJvYXJkLCB5b3UgY2FuIHVwbG9hZCBvciBub3QuXCI6XHJcbiAgICBcIuW9k+S9oOWkjeWItuaXtu+8jOafkOS6m+W6lOeUqOS+i+WmgiBFeGNlbCDkvJrlnKjliarliIfmnb/lkIzml7bmlofmnKzlkozlm77lg4/mlbDmja7vvIznoa7orqTmmK/lkKbkuIrkvKDjgIJcIixcclxuICBcIk5ldHdvcmsgRG9tYWluIEJsYWNrIExpc3RcIjogXCLnvZHnu5zlm77niYfln5/lkI3pu5HlkI3ljZVcIixcclxuICBcIk5ldHdvcmsgRG9tYWluIEJsYWNrIExpc3QgRGVzY3JpcHRpb25cIjpcclxuICAgIFwi6buR5ZCN5Y2V5Z+f5ZCN5Lit55qE5Zu+54mH5bCG5LiN5Lya6KKr5LiK5Lyg77yM55So6Iux5paH6YCX5Y+35YiG5YmyXCIsXHJcbiAgXCJEZWxldGUgc291cmNlIGZpbGUgYWZ0ZXIgeW91IHVwbG9hZCBmaWxlXCI6IFwi5LiK5Lyg5paH5Lu25ZCO56e76Zmk5rqQ5paH5Lu2XCIsXHJcbiAgXCJEZWxldGUgc291cmNlIGZpbGUgaW4gb2IgYXNzZXRzIGFmdGVyIHlvdSB1cGxvYWQgZmlsZS5cIjpcclxuICAgIFwi5LiK5Lyg5paH5Lu25ZCO56e76Zmk5Zyob2LpmYTku7bmlofku7blpLnkuK3nmoTmlofku7ZcIixcclxuICBcIkltYWdlIGRlc2NcIjogXCLlm77niYfmj4/ov7BcIixcclxuICByZXNlcnZlOiBcIum7mOiupFwiLFxyXG4gIFwicmVtb3ZlIGFsbFwiOiBcIuaXoFwiLFxyXG4gIFwicmVtb3ZlIGRlZmF1bHRcIjogXCLnp7vpmaRpbWFnZS5wbmdcIixcclxuICBcIlJlbW90ZSBzZXJ2ZXIgbW9kZVwiOiBcIui/nOeoi+acjeWKoeWZqOaooeW8j1wiLFxyXG4gIFwiUmVtb3RlIHNlcnZlciBtb2RlIGRlc2NcIjogXCLlpoLmnpzkvaDlnKjmnI3liqHlmajpg6jnvbLkuoZwaWNsaXN0LWNvcmXmiJbogIVwaWNsaXN0XCIsXHJcbiAgXCJDYW4gbm90IGZpbmQgaW1hZ2UgZmlsZVwiOiBcIuayoeacieino+aekOWIsOWbvuWDj+aWh+S7tlwiLFxyXG4gIFwiRmlsZSBoYXMgYmVlbiBjaGFuZ2VkZCwgdXBsb2FkIGZhaWx1cmVcIjogXCLlvZPliY3mlofku7blt7Llj5jmm7TvvIzkuIrkvKDlpLHotKVcIixcclxuICBcIkZpbGUgaGFzIGJlZW4gY2hhbmdlZGQsIGRvd25sb2FkIGZhaWx1cmVcIjogXCLlvZPliY3mlofku7blt7Llj5jmm7TvvIzkuIvovb3lpLHotKVcIixcclxuICBcIldhcm5pbmc6IHVwbG9hZCBmaWxlcyBpcyBkaWZmZXJlbnQgb2YgcmVjaXZlciBmaWxlcyBmcm9tIGFwaVwiOlxyXG4gICAgXCLorablkYrvvJrkuIrkvKDnmoTmlofku7bkuI7mjqXlj6Pov5Tlm57nmoTmlofku7bmlbDph4/kuI3kuIDoh7RcIixcclxuICB1cGxvYWQ6IFwi5LiK5LygXCIsXHJcbn07XHJcbiIsIi8vIOe5gemrlOS4reaWh1xyXG5cclxuZXhwb3J0IGRlZmF1bHQge307XHJcbiIsImltcG9ydCB7IG1vbWVudCB9IGZyb20gJ29ic2lkaWFuJztcclxuXHJcbmltcG9ydCBhciBmcm9tICcuL2xvY2FsZS9hcic7XHJcbmltcG9ydCBjeiBmcm9tICcuL2xvY2FsZS9jeic7XHJcbmltcG9ydCBkYSBmcm9tICcuL2xvY2FsZS9kYSc7XHJcbmltcG9ydCBkZSBmcm9tICcuL2xvY2FsZS9kZSc7XHJcbmltcG9ydCBlbiBmcm9tICcuL2xvY2FsZS9lbic7XHJcbmltcG9ydCBlbkdCIGZyb20gJy4vbG9jYWxlL2VuLWdiJztcclxuaW1wb3J0IGVzIGZyb20gJy4vbG9jYWxlL2VzJztcclxuaW1wb3J0IGZyIGZyb20gJy4vbG9jYWxlL2ZyJztcclxuaW1wb3J0IGhpIGZyb20gJy4vbG9jYWxlL2hpJztcclxuaW1wb3J0IGlkIGZyb20gJy4vbG9jYWxlL2lkJztcclxuaW1wb3J0IGl0IGZyb20gJy4vbG9jYWxlL2l0JztcclxuaW1wb3J0IGphIGZyb20gJy4vbG9jYWxlL2phJztcclxuaW1wb3J0IGtvIGZyb20gJy4vbG9jYWxlL2tvJztcclxuaW1wb3J0IG5sIGZyb20gJy4vbG9jYWxlL25sJztcclxuaW1wb3J0IG5vIGZyb20gJy4vbG9jYWxlL25vJztcclxuaW1wb3J0IHBsIGZyb20gJy4vbG9jYWxlL3BsJztcclxuaW1wb3J0IHB0IGZyb20gJy4vbG9jYWxlL3B0JztcclxuaW1wb3J0IHB0QlIgZnJvbSAnLi9sb2NhbGUvcHQtYnInO1xyXG5pbXBvcnQgcm8gZnJvbSAnLi9sb2NhbGUvcm8nO1xyXG5pbXBvcnQgcnUgZnJvbSAnLi9sb2NhbGUvcnUnO1xyXG5pbXBvcnQgdHIgZnJvbSAnLi9sb2NhbGUvdHInO1xyXG5pbXBvcnQgemhDTiBmcm9tICcuL2xvY2FsZS96aC1jbic7XHJcbmltcG9ydCB6aFRXIGZyb20gJy4vbG9jYWxlL3poLXR3JztcclxuXHJcbmNvbnN0IGxvY2FsZU1hcDogeyBbazogc3RyaW5nXTogUGFydGlhbDx0eXBlb2YgZW4+IH0gPSB7XHJcbiAgYXIsXHJcbiAgY3M6IGN6LFxyXG4gIGRhLFxyXG4gIGRlLFxyXG4gIGVuLFxyXG4gICdlbi1nYic6IGVuR0IsXHJcbiAgZXMsXHJcbiAgZnIsXHJcbiAgaGksXHJcbiAgaWQsXHJcbiAgaXQsXHJcbiAgamEsXHJcbiAga28sXHJcbiAgbmwsXHJcbiAgbm46IG5vLFxyXG4gIHBsLFxyXG4gIHB0LFxyXG4gICdwdC1icic6IHB0QlIsXHJcbiAgcm8sXHJcbiAgcnUsXHJcbiAgdHIsXHJcbiAgJ3poLWNuJzogemhDTixcclxuICAnemgtdHcnOiB6aFRXLFxyXG59O1xyXG5cclxuY29uc3QgbG9jYWxlID0gbG9jYWxlTWFwW21vbWVudC5sb2NhbGUoKV07XHJcblxyXG5leHBvcnQgZnVuY3Rpb24gdChzdHI6IGtleW9mIHR5cGVvZiBlbik6IHN0cmluZyB7XHJcbiAgcmV0dXJuIChsb2NhbGUgJiYgbG9jYWxlW3N0cl0pIHx8IGVuW3N0cl07XHJcbn1cclxuIiwiaW1wb3J0IHsgbm9ybWFsaXplUGF0aCwgTm90aWNlLCByZXF1ZXN0VXJsIH0gZnJvbSBcIm9ic2lkaWFuXCI7XHJcblxyXG5pbXBvcnQgeyByZWxhdGl2ZSwgam9pbiwgcGFyc2UgfSBmcm9tIFwicGF0aC1icm93c2VyaWZ5XCI7XHJcbmltcG9ydCBpbWFnZVR5cGUgZnJvbSBcImltYWdlLXR5cGVcIjtcclxuXHJcbmltcG9ydCB7IGdldFVybEFzc2V0LCB1dWlkIH0gZnJvbSBcIi4vdXRpbHNcIjtcclxuaW1wb3J0IHsgdCB9IGZyb20gXCIuL2xhbmcvaGVscGVyc1wiO1xyXG5pbXBvcnQgdHlwZSBpbWFnZUF1dG9VcGxvYWRQbHVnaW4gZnJvbSBcIi4vbWFpblwiO1xyXG5cclxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGRvd25sb2FkQWxsSW1hZ2VGaWxlcyhwbHVnaW46IGltYWdlQXV0b1VwbG9hZFBsdWdpbikge1xyXG4gIGNvbnN0IGFjdGl2ZUZpbGUgPSBwbHVnaW4uYXBwLndvcmtzcGFjZS5nZXRBY3RpdmVGaWxlKCk7XHJcbiAgY29uc3QgZm9sZGVyUGF0aCA9IGF3YWl0IHBsdWdpbi5hcHAuZmlsZU1hbmFnZXIuZ2V0QXZhaWxhYmxlUGF0aEZvckF0dGFjaG1lbnQoXHJcbiAgICBcIlwiXHJcbiAgKTtcclxuXHJcbiAgY29uc3QgZmlsZUFycmF5ID0gcGx1Z2luLmhlbHBlci5nZXRBbGxGaWxlcygpO1xyXG5cclxuICBpZiAoIShhd2FpdCBwbHVnaW4uYXBwLnZhdWx0LmFkYXB0ZXIuZXhpc3RzKGZvbGRlclBhdGgpKSkge1xyXG4gICAgYXdhaXQgcGx1Z2luLmFwcC52YXVsdC5hZGFwdGVyLm1rZGlyKGZvbGRlclBhdGgpO1xyXG4gIH1cclxuXHJcbiAgbGV0IGltYWdlQXJyYXkgPSBbXTtcclxuICBmb3IgKGNvbnN0IGZpbGUgb2YgZmlsZUFycmF5KSB7XHJcbiAgICBpZiAoIWZpbGUucGF0aC5zdGFydHNXaXRoKFwiaHR0cFwiKSkge1xyXG4gICAgICBjb250aW51ZTtcclxuICAgIH1cclxuXHJcbiAgICBjb25zdCB1cmwgPSBmaWxlLnBhdGg7XHJcbiAgICBjb25zdCBhc3NldCA9IGdldFVybEFzc2V0KHVybCk7XHJcbiAgICBsZXQgbmFtZSA9IGRlY29kZVVSSShwYXJzZShhc3NldCkubmFtZSkucmVwbGFjZUFsbCgvW1xcXFxcXFxcLzoqP1xcXCI8PnxdL2csIFwiLVwiKTtcclxuXHJcbiAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IGRvd25sb2FkKHBsdWdpbiwgdXJsLCBmb2xkZXJQYXRoLCBuYW1lKTtcclxuICAgIGlmIChyZXNwb25zZS5vaykge1xyXG4gICAgICBjb25zdCBhY3RpdmVGb2xkZXIgPSBwbHVnaW4uYXBwLndvcmtzcGFjZS5nZXRBY3RpdmVGaWxlKCkucGFyZW50LnBhdGg7XHJcblxyXG4gICAgICBpbWFnZUFycmF5LnB1c2goe1xyXG4gICAgICAgIHNvdXJjZTogZmlsZS5zb3VyY2UsXHJcbiAgICAgICAgbmFtZTogbmFtZSxcclxuICAgICAgICBwYXRoOiBub3JtYWxpemVQYXRoKFxyXG4gICAgICAgICAgcmVsYXRpdmUobm9ybWFsaXplUGF0aChhY3RpdmVGb2xkZXIpLCBub3JtYWxpemVQYXRoKHJlc3BvbnNlLnBhdGgpKVxyXG4gICAgICAgICksXHJcbiAgICAgIH0pO1xyXG4gICAgfVxyXG4gIH1cclxuXHJcbiAgbGV0IHZhbHVlID0gcGx1Z2luLmhlbHBlci5nZXRWYWx1ZSgpO1xyXG4gIGltYWdlQXJyYXkubWFwKGltYWdlID0+IHtcclxuICAgIGxldCBuYW1lID0gcGx1Z2luLmhhbmRsZU5hbWUoaW1hZ2UubmFtZSk7XHJcblxyXG4gICAgdmFsdWUgPSB2YWx1ZS5yZXBsYWNlKGltYWdlLnNvdXJjZSwgYCFbJHtuYW1lfV0oJHtlbmNvZGVVUkkoaW1hZ2UucGF0aCl9KWApO1xyXG4gIH0pO1xyXG5cclxuICBjb25zdCBjdXJyZW50RmlsZSA9IHBsdWdpbi5hcHAud29ya3NwYWNlLmdldEFjdGl2ZUZpbGUoKTtcclxuICBpZiAoYWN0aXZlRmlsZS5wYXRoICE9PSBjdXJyZW50RmlsZS5wYXRoKSB7XHJcbiAgICBuZXcgTm90aWNlKHQoXCJGaWxlIGhhcyBiZWVuIGNoYW5nZWRkLCBkb3dubG9hZCBmYWlsdXJlXCIpKTtcclxuICAgIHJldHVybjtcclxuICB9XHJcbiAgcGx1Z2luLmhlbHBlci5zZXRWYWx1ZSh2YWx1ZSk7XHJcblxyXG4gIG5ldyBOb3RpY2UoXHJcbiAgICBgYWxsOiAke2ZpbGVBcnJheS5sZW5ndGh9XFxuc3VjY2VzczogJHtpbWFnZUFycmF5Lmxlbmd0aH1cXG5mYWlsZWQ6ICR7XHJcbiAgICAgIGZpbGVBcnJheS5sZW5ndGggLSBpbWFnZUFycmF5Lmxlbmd0aFxyXG4gICAgfWBcclxuICApO1xyXG59XHJcblxyXG5hc3luYyBmdW5jdGlvbiBkb3dubG9hZChcclxuICBwbHVnaW46IGltYWdlQXV0b1VwbG9hZFBsdWdpbixcclxuICB1cmw6IHN0cmluZyxcclxuICBmb2xkZXJQYXRoOiBzdHJpbmcsXHJcbiAgbmFtZTogc3RyaW5nXHJcbikge1xyXG4gIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgcmVxdWVzdFVybCh7IHVybCB9KTtcclxuXHJcbiAgaWYgKHJlc3BvbnNlLnN0YXR1cyAhPT0gMjAwKSB7XHJcbiAgICByZXR1cm4ge1xyXG4gICAgICBvazogZmFsc2UsXHJcbiAgICAgIG1zZzogXCJlcnJvclwiLFxyXG4gICAgfTtcclxuICB9XHJcblxyXG4gIGNvbnN0IHR5cGUgPSBhd2FpdCBpbWFnZVR5cGUobmV3IFVpbnQ4QXJyYXkocmVzcG9uc2UuYXJyYXlCdWZmZXIpKTtcclxuICBpZiAoIXR5cGUpIHtcclxuICAgIHJldHVybiB7XHJcbiAgICAgIG9rOiBmYWxzZSxcclxuICAgICAgbXNnOiBcImVycm9yXCIsXHJcbiAgICB9O1xyXG4gIH1cclxuXHJcbiAgdHJ5IHtcclxuICAgIGxldCBwYXRoID0gbm9ybWFsaXplUGF0aChqb2luKGZvbGRlclBhdGgsIGAke25hbWV9LiR7dHlwZS5leHR9YCkpO1xyXG5cclxuICAgIC8vIOWmguaenOaWh+S7tuWQjeW3suWtmOWcqO+8jOWImeeUqOmaj+acuuWAvOabv+aNou+8jOS4jeWvueaWh+S7tuWQjue8gOi/m+ihjOWIpOaWrVxyXG4gICAgaWYgKGF3YWl0IHBsdWdpbi5hcHAudmF1bHQuYWRhcHRlci5leGlzdHMocGF0aCkpIHtcclxuICAgICAgcGF0aCA9IG5vcm1hbGl6ZVBhdGgoam9pbihmb2xkZXJQYXRoLCBgJHt1dWlkKCl9LiR7dHlwZS5leHR9YCkpO1xyXG4gICAgfVxyXG5cclxuICAgIHBsdWdpbi5hcHAudmF1bHQuYWRhcHRlci53cml0ZUJpbmFyeShwYXRoLCByZXNwb25zZS5hcnJheUJ1ZmZlcik7XHJcbiAgICByZXR1cm4ge1xyXG4gICAgICBvazogdHJ1ZSxcclxuICAgICAgbXNnOiBcIm9rXCIsXHJcbiAgICAgIHBhdGg6IHBhdGgsXHJcbiAgICAgIHR5cGUsXHJcbiAgICB9O1xyXG4gIH0gY2F0Y2ggKGVycikge1xyXG4gICAgcmV0dXJuIHtcclxuICAgICAgb2s6IGZhbHNlLFxyXG4gICAgICBtc2c6IGVycixcclxuICAgIH07XHJcbiAgfVxyXG59XHJcbiIsImltcG9ydCB7IGdldEJsb2JBcnJheUJ1ZmZlciB9IGZyb20gXCJvYnNpZGlhblwiO1xyXG5cclxudHlwZSBQYXlsb2FkQW5kQm91bmRhcnkgPSBbQXJyYXlCdWZmZXIsIHN0cmluZ107XHJcblxyXG50eXBlIElucHV0VHlwZSA9IHN0cmluZyB8IEJsb2IgfCBBcnJheUJ1ZmZlciB8IEZpbGU7XHJcblxyXG5leHBvcnQgdHlwZSBQYXlsb2FkRGF0YSA9IHsgW2tleTogc3RyaW5nXTogSW5wdXRUeXBlIHwgSW5wdXRUeXBlW10gfTtcclxuXHJcbmV4cG9ydCBjb25zdCByYW5kb21TdHJpbmcgPSAobGVuZ3RoOiBudW1iZXIpID0+XHJcbiAgQXJyYXkobGVuZ3RoICsgMSlcclxuICAgIC5qb2luKChNYXRoLnJhbmRvbSgpLnRvU3RyaW5nKDM2KSArIFwiMDAwMDAwMDAwMDAwMDAwMDBcIikuc2xpY2UoMiwgMTgpKVxyXG4gICAgLnNsaWNlKDAsIGxlbmd0aCk7XHJcblxyXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gcGF5bG9hZEdlbmVyYXRvcihcclxuICBwYXlsb2FkX2RhdGE6IFBheWxvYWREYXRhXHJcbik6IFByb21pc2U8UGF5bG9hZEFuZEJvdW5kYXJ5PiB7XHJcbiAgY29uc3QgYm91bmRhcnlfc3RyaW5nID0gYEJvdW5kYXJ5JHtyYW5kb21TdHJpbmcoMTYpfWA7XHJcbiAgY29uc3QgYm91bmRhcnkgPSBgLS0tLS0tJHtib3VuZGFyeV9zdHJpbmd9YDtcclxuICBjb25zdCBjaHVua3M6IFVpbnQ4QXJyYXlbXSA9IFtdO1xyXG5cclxuICBmb3IgKGNvbnN0IFtrZXksIHZhbHVlc10gb2YgT2JqZWN0LmVudHJpZXMocGF5bG9hZF9kYXRhKSkge1xyXG4gICAgZm9yIChjb25zdCB2YWx1ZSBvZiBBcnJheS5pc0FycmF5KHZhbHVlcykgPyB2YWx1ZXMgOiBbdmFsdWVzXSkge1xyXG4gICAgICBjaHVua3MucHVzaChuZXcgVGV4dEVuY29kZXIoKS5lbmNvZGUoYCR7Ym91bmRhcnl9XFxyXFxuYCkpO1xyXG4gICAgICBpZiAodHlwZW9mIHZhbHVlID09PSBcInN0cmluZ1wiKSB7XHJcbiAgICAgICAgY2h1bmtzLnB1c2goXHJcbiAgICAgICAgICBuZXcgVGV4dEVuY29kZXIoKS5lbmNvZGUoXHJcbiAgICAgICAgICAgIGBDb250ZW50LURpc3Bvc2l0aW9uOiBmb3JtLWRhdGE7IG5hbWU9XCIke2tleX1cIlxcclxcblxcclxcbiR7dmFsdWV9XFxyXFxuYFxyXG4gICAgICAgICAgKVxyXG4gICAgICAgICk7XHJcbiAgICAgIH0gZWxzZSBpZiAodmFsdWUgaW5zdGFuY2VvZiBGaWxlKSB7XHJcbiAgICAgICAgY2h1bmtzLnB1c2goXHJcbiAgICAgICAgICBuZXcgVGV4dEVuY29kZXIoKS5lbmNvZGUoXHJcbiAgICAgICAgICAgIGBDb250ZW50LURpc3Bvc2l0aW9uOiBmb3JtLWRhdGE7IG5hbWU9XCIke2tleX1cIjsgZmlsZW5hbWU9XCIke1xyXG4gICAgICAgICAgICAgIHZhbHVlLm5hbWVcclxuICAgICAgICAgICAgfVwiXFxyXFxuQ29udGVudC1UeXBlOiAke1xyXG4gICAgICAgICAgICAgIHZhbHVlLnR5cGUgfHwgXCJhcHBsaWNhdGlvbi9vY3RldC1zdHJlYW1cIlxyXG4gICAgICAgICAgICB9XFxyXFxuXFxyXFxuYFxyXG4gICAgICAgICAgKVxyXG4gICAgICAgICk7XHJcbiAgICAgICAgY2h1bmtzLnB1c2gobmV3IFVpbnQ4QXJyYXkoYXdhaXQgZ2V0QmxvYkFycmF5QnVmZmVyKHZhbHVlKSkpO1xyXG4gICAgICAgIGNodW5rcy5wdXNoKG5ldyBUZXh0RW5jb2RlcigpLmVuY29kZShcIlxcclxcblwiKSk7XHJcbiAgICAgIH0gZWxzZSBpZiAodmFsdWUgaW5zdGFuY2VvZiBCbG9iKSB7XHJcbiAgICAgICAgY2h1bmtzLnB1c2goXHJcbiAgICAgICAgICBuZXcgVGV4dEVuY29kZXIoKS5lbmNvZGUoXHJcbiAgICAgICAgICAgIGBDb250ZW50LURpc3Bvc2l0aW9uOiBmb3JtLWRhdGE7IG5hbWU9XCIke2tleX1cIjsgZmlsZW5hbWU9XCJibG9iXCJcXHJcXG5Db250ZW50LVR5cGU6ICR7XHJcbiAgICAgICAgICAgICAgdmFsdWUudHlwZSB8fCBcImFwcGxpY2F0aW9uL29jdGV0LXN0cmVhbVwiXHJcbiAgICAgICAgICAgIH1cXHJcXG5cXHJcXG5gXHJcbiAgICAgICAgICApXHJcbiAgICAgICAgKTtcclxuICAgICAgICBjaHVua3MucHVzaChuZXcgVWludDhBcnJheShhd2FpdCB2YWx1ZS5hcnJheUJ1ZmZlcigpKSk7XHJcbiAgICAgICAgY2h1bmtzLnB1c2gobmV3IFRleHRFbmNvZGVyKCkuZW5jb2RlKFwiXFxyXFxuXCIpKTtcclxuICAgICAgfSBlbHNlIHtcclxuICAgICAgICBjaHVua3MucHVzaChuZXcgVWludDhBcnJheShhd2FpdCBuZXcgUmVzcG9uc2UodmFsdWUpLmFycmF5QnVmZmVyKCkpKTtcclxuICAgICAgICBjaHVua3MucHVzaChuZXcgVGV4dEVuY29kZXIoKS5lbmNvZGUoXCJcXHJcXG5cIikpO1xyXG4gICAgICB9XHJcbiAgICB9XHJcbiAgfVxyXG5cclxuICBjaHVua3MucHVzaChuZXcgVGV4dEVuY29kZXIoKS5lbmNvZGUoYCR7Ym91bmRhcnl9LS1cXHJcXG5gKSk7XHJcblxyXG4gIGNvbnN0IHBheWxvYWQgPSBuZXcgQmxvYihjaHVua3MsIHtcclxuICAgIHR5cGU6IFwibXVsdGlwYXJ0L2Zvcm0tZGF0YTsgYm91bmRhcnk9XCIgKyBib3VuZGFyeV9zdHJpbmcsXHJcbiAgfSk7XHJcbiAgcmV0dXJuIFthd2FpdCBwYXlsb2FkLmFycmF5QnVmZmVyKCksIGJvdW5kYXJ5X3N0cmluZ107XHJcbn1cclxuIiwiaW1wb3J0IHsgam9pbiwgZXh0bmFtZSB9IGZyb20gXCJwYXRoLWJyb3dzZXJpZnlcIjtcclxuaW1wb3J0IHsgcmVxdWVzdFVybCwgbm9ybWFsaXplUGF0aCwgRmlsZVN5c3RlbUFkYXB0ZXIgfSBmcm9tIFwib2JzaWRpYW5cIjtcclxuXHJcbmltcG9ydCB7IGJ1ZmZlclRvQXJyYXlCdWZmZXIgfSBmcm9tIFwiLi4vdXRpbHNcIjtcclxuaW1wb3J0IHsgcGF5bG9hZEdlbmVyYXRvciB9IGZyb20gXCIuLi9wYXlsb2FkR2VuZXJhdG9yXCI7XHJcblxyXG5pbXBvcnQgdHlwZSBpbWFnZUF1dG9VcGxvYWRQbHVnaW4gZnJvbSBcIi4uL21haW5cIjtcclxuaW1wb3J0IHR5cGUgeyBJbWFnZSB9IGZyb20gXCIuLi90eXBlc1wiO1xyXG5pbXBvcnQgdHlwZSB7IFJlc3BvbnNlLCBVcGxvYWRlciB9IGZyb20gXCIuL3R5cGVzXCI7XHJcbmltcG9ydCB0eXBlIHsgUGx1Z2luU2V0dGluZ3MgfSBmcm9tIFwiLi4vc2V0dGluZ1wiO1xyXG5cclxuaW50ZXJmYWNlIFBpY0dvUmVzcG9uc2Uge1xyXG4gIHN1Y2Nlc3M/OiBib29sZWFuO1xyXG4gIG1lc3NhZ2U/OiBzdHJpbmc7XHJcbiAgbXNnPzogc3RyaW5nO1xyXG4gIHJlc3VsdDogc3RyaW5nW10gfCBzdHJpbmc7XHJcbiAgZnVsbFJlc3VsdD86IFJlY29yZDxzdHJpbmcsIGFueT5bXTtcclxufVxyXG5cclxuZXhwb3J0IGRlZmF1bHQgY2xhc3MgUGljR29VcGxvYWRlciBpbXBsZW1lbnRzIFVwbG9hZGVyIHtcclxuICBzZXR0aW5nczogUGx1Z2luU2V0dGluZ3M7XHJcbiAgcGx1Z2luOiBpbWFnZUF1dG9VcGxvYWRQbHVnaW47XHJcblxyXG4gIGNvbnN0cnVjdG9yKHBsdWdpbjogaW1hZ2VBdXRvVXBsb2FkUGx1Z2luKSB7XHJcbiAgICB0aGlzLnNldHRpbmdzID0gcGx1Z2luLnNldHRpbmdzO1xyXG4gICAgdGhpcy5wbHVnaW4gPSBwbHVnaW47XHJcbiAgfVxyXG5cclxuICBwcml2YXRlIGFzeW5jIHVwbG9hZEZpbGVzKGZpbGVMaXN0OiBBcnJheTxJbWFnZSB8IHN0cmluZz4pIHtcclxuICAgIGxldCByZXNwb25zZTogQXdhaXRlZDxSZXR1cm5UeXBlPHR5cGVvZiByZXF1ZXN0VXJsPj47XHJcblxyXG4gICAgaWYgKHRoaXMuc2V0dGluZ3MucmVtb3RlU2VydmVyTW9kZSkge1xyXG4gICAgICBjb25zdCBmaWxlcyA9IFtdO1xyXG4gICAgICBmb3IgKGxldCBpID0gMDsgaSA8IGZpbGVMaXN0Lmxlbmd0aDsgaSsrKSB7XHJcbiAgICAgICAgaWYgKHR5cGVvZiBmaWxlTGlzdFtpXSA9PT0gXCJzdHJpbmdcIikge1xyXG4gICAgICAgICAgY29uc3QgeyByZWFkRmlsZSB9ID0gcmVxdWlyZShcImZzXCIpO1xyXG4gICAgICAgICAgY29uc3QgZmlsZSA9IGZpbGVMaXN0W2ldIGFzIHN0cmluZztcclxuXHJcbiAgICAgICAgICBjb25zdCBidWZmZXI6IEJ1ZmZlciA9IGF3YWl0IG5ldyBQcm9taXNlKChyZXNvbHZlLCByZWplY3QpID0+IHtcclxuICAgICAgICAgICAgcmVhZEZpbGUoZmlsZSwgKGVycjogYW55LCBkYXRhOiBhbnkpID0+IHtcclxuICAgICAgICAgICAgICBpZiAoZXJyKSB7XHJcbiAgICAgICAgICAgICAgICByZWplY3QoZXJyKTtcclxuICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgcmVzb2x2ZShkYXRhKTtcclxuICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgICB9KTtcclxuICAgICAgICAgIGNvbnN0IGFycmF5QnVmZmVyID0gYnVmZmVyVG9BcnJheUJ1ZmZlcihidWZmZXIpO1xyXG4gICAgICAgICAgZmlsZXMucHVzaChuZXcgRmlsZShbYXJyYXlCdWZmZXJdLCBmaWxlKSk7XHJcbiAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgIGNvbnN0IHRpbWVzdGFtcCA9IG5ldyBEYXRlKCkuZ2V0VGltZSgpO1xyXG4gICAgICAgICAgY29uc3QgaW1hZ2UgPSBmaWxlTGlzdFtpXSBhcyBJbWFnZTtcclxuXHJcbiAgICAgICAgICBpZiAoIWltYWdlLmZpbGUpIGNvbnRpbnVlO1xyXG4gICAgICAgICAgY29uc3QgYXJyYXlCdWZmZXIgPSBhd2FpdCB0aGlzLnBsdWdpbi5hcHAudmF1bHQuYWRhcHRlci5yZWFkQmluYXJ5KFxyXG4gICAgICAgICAgICBpbWFnZS5maWxlLnBhdGhcclxuICAgICAgICAgICk7XHJcblxyXG4gICAgICAgICAgZmlsZXMucHVzaChcclxuICAgICAgICAgICAgbmV3IEZpbGUoW2FycmF5QnVmZmVyXSwgdGltZXN0YW1wICsgZXh0bmFtZShpbWFnZS5maWxlLnBhdGgpKVxyXG4gICAgICAgICAgKTtcclxuICAgICAgICB9XHJcbiAgICAgIH1cclxuICAgICAgcmVzcG9uc2UgPSBhd2FpdCB0aGlzLnVwbG9hZEZpbGVCeURhdGEoZmlsZXMpO1xyXG4gICAgfSBlbHNlIHtcclxuICAgICAgY29uc3QgYmFzZVBhdGggPSAoXHJcbiAgICAgICAgdGhpcy5wbHVnaW4uYXBwLnZhdWx0LmFkYXB0ZXIgYXMgRmlsZVN5c3RlbUFkYXB0ZXJcclxuICAgICAgKS5nZXRCYXNlUGF0aCgpO1xyXG5cclxuICAgICAgY29uc3QgbGlzdCA9IGZpbGVMaXN0Lm1hcChpdGVtID0+IHtcclxuICAgICAgICBpZiAodHlwZW9mIGl0ZW0gPT09IFwic3RyaW5nXCIpIHtcclxuICAgICAgICAgIHJldHVybiBpdGVtO1xyXG4gICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICByZXR1cm4gbm9ybWFsaXplUGF0aChqb2luKGJhc2VQYXRoLCBpdGVtLnBhdGgpKTtcclxuICAgICAgICB9XHJcbiAgICAgIH0pO1xyXG5cclxuICAgICAgcmVzcG9uc2UgPSBhd2FpdCByZXF1ZXN0VXJsKHtcclxuICAgICAgICB1cmw6IHRoaXMuc2V0dGluZ3MudXBsb2FkU2VydmVyLFxyXG4gICAgICAgIG1ldGhvZDogXCJQT1NUXCIsXHJcbiAgICAgICAgaGVhZGVyczogeyBcIkNvbnRlbnQtVHlwZVwiOiBcImFwcGxpY2F0aW9uL2pzb25cIiB9LFxyXG4gICAgICAgIGJvZHk6IEpTT04uc3RyaW5naWZ5KHsgbGlzdDogbGlzdCB9KSxcclxuICAgICAgfSk7XHJcbiAgICB9XHJcblxyXG4gICAgcmV0dXJuIHRoaXMuaGFuZGxlUmVzcG9uc2UocmVzcG9uc2UpO1xyXG4gIH1cclxuXHJcbiAgcHJpdmF0ZSBhc3luYyB1cGxvYWRGaWxlQnlEYXRhKGZpbGVMaXN0OiBGaWxlTGlzdCB8IEZpbGVbXSkge1xyXG4gICAgY29uc3QgcGF5bG9hZF9kYXRhOiB7XHJcbiAgICAgIFtrZXk6IHN0cmluZ106IChzdHJpbmcgfCBCbG9iIHwgQXJyYXlCdWZmZXIgfCBGaWxlKVtdO1xyXG4gICAgfSA9IHtcclxuICAgICAgbGlzdDogW10sXHJcbiAgICB9O1xyXG5cclxuICAgIGZvciAobGV0IGkgPSAwOyBpIDwgZmlsZUxpc3QubGVuZ3RoOyBpKyspIHtcclxuICAgICAgY29uc3QgZmlsZSA9IGZpbGVMaXN0W2ldO1xyXG4gICAgICBwYXlsb2FkX2RhdGFbXCJsaXN0XCJdLnB1c2goZmlsZSk7XHJcbiAgICB9XHJcblxyXG4gICAgY29uc3QgW3JlcXVlc3RfYm9keSwgYm91bmRhcnlfc3RyaW5nXSA9IGF3YWl0IHBheWxvYWRHZW5lcmF0b3IoXHJcbiAgICAgIHBheWxvYWRfZGF0YVxyXG4gICAgKTtcclxuXHJcbiAgICBjb25zdCBvcHRpb25zID0ge1xyXG4gICAgICBtZXRob2Q6IFwiUE9TVFwiLFxyXG4gICAgICB1cmw6IHRoaXMuc2V0dGluZ3MudXBsb2FkU2VydmVyLFxyXG4gICAgICBjb250ZW50VHlwZTogYG11bHRpcGFydC9mb3JtLWRhdGE7IGJvdW5kYXJ5PS0tLS0ke2JvdW5kYXJ5X3N0cmluZ31gLFxyXG4gICAgICBib2R5OiByZXF1ZXN0X2JvZHksXHJcbiAgICB9O1xyXG4gICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCByZXF1ZXN0VXJsKG9wdGlvbnMpO1xyXG5cclxuICAgIHJldHVybiByZXNwb25zZTtcclxuICB9XHJcblxyXG4gIHByaXZhdGUgYXN5bmMgdXBsb2FkRmlsZUJ5Q2xpcGJvYXJkKGZpbGVMaXN0PzogRmlsZUxpc3QpOiBQcm9taXNlPGFueT4ge1xyXG4gICAgbGV0IHJlczogQXdhaXRlZDxSZXR1cm5UeXBlPHR5cGVvZiByZXF1ZXN0VXJsPj47XHJcblxyXG4gICAgaWYgKHRoaXMuc2V0dGluZ3MucmVtb3RlU2VydmVyTW9kZSkge1xyXG4gICAgICBjb25zdCBmaWxlcyA9IFtdO1xyXG4gICAgICBmb3IgKGxldCBpID0gMDsgaSA8IGZpbGVMaXN0Lmxlbmd0aDsgaSsrKSB7XHJcbiAgICAgICAgY29uc3QgdGltZXN0YW1wID0gbmV3IERhdGUoKS5nZXRUaW1lKCk7XHJcblxyXG4gICAgICAgIGNvbnN0IGZpbGUgPSBmaWxlTGlzdFtpXTtcclxuICAgICAgICBjb25zdCBhcnJheUJ1ZmZlciA9IGF3YWl0IGZpbGUuYXJyYXlCdWZmZXIoKTtcclxuICAgICAgICBmaWxlcy5wdXNoKG5ldyBGaWxlKFthcnJheUJ1ZmZlcl0sIHRpbWVzdGFtcCArIFwiLnBuZ1wiKSk7XHJcbiAgICAgIH1cclxuICAgICAgcmVzID0gYXdhaXQgdGhpcy51cGxvYWRGaWxlQnlEYXRhKGZpbGVzKTtcclxuICAgIH0gZWxzZSB7XHJcbiAgICAgIHJlcyA9IGF3YWl0IHJlcXVlc3RVcmwoe1xyXG4gICAgICAgIHVybDogdGhpcy5zZXR0aW5ncy51cGxvYWRTZXJ2ZXIsXHJcbiAgICAgICAgbWV0aG9kOiBcIlBPU1RcIixcclxuICAgICAgfSk7XHJcbiAgICB9XHJcbiAgICByZXR1cm4gdGhpcy5oYW5kbGVSZXNwb25zZShyZXMpO1xyXG4gIH1cclxuXHJcbiAgLyoqXHJcbiAgICog5aSE55CG6L+U5Zue5YC8XHJcbiAgICovXHJcbiAgcHJpdmF0ZSBhc3luYyBoYW5kbGVSZXNwb25zZShcclxuICAgIHJlc3BvbnNlOiBBd2FpdGVkPFJldHVyblR5cGU8dHlwZW9mIHJlcXVlc3RVcmw+PlxyXG4gICk6IFByb21pc2U8UmVzcG9uc2U+IHtcclxuICAgIGNvbnN0IGRhdGEgPSAoYXdhaXQgcmVzcG9uc2UuanNvbikgYXMgUGljR29SZXNwb25zZTtcclxuXHJcbiAgICBpZiAocmVzcG9uc2Uuc3RhdHVzICE9PSAyMDApIHtcclxuICAgICAgY29uc29sZS5lcnJvcihyZXNwb25zZSwgZGF0YSk7XHJcbiAgICAgIHJldHVybiB7XHJcbiAgICAgICAgc3VjY2VzczogZmFsc2UsXHJcbiAgICAgICAgbXNnOiBkYXRhLm1zZyB8fCBkYXRhLm1lc3NhZ2UsXHJcbiAgICAgICAgcmVzdWx0OiBbXSxcclxuICAgICAgfTtcclxuICAgIH1cclxuICAgIGlmIChkYXRhLnN1Y2Nlc3MgPT09IGZhbHNlKSB7XHJcbiAgICAgIGNvbnNvbGUuZXJyb3IocmVzcG9uc2UsIGRhdGEpO1xyXG4gICAgICByZXR1cm4ge1xyXG4gICAgICAgIHN1Y2Nlc3M6IGZhbHNlLFxyXG4gICAgICAgIG1zZzogZGF0YS5tc2cgfHwgZGF0YS5tZXNzYWdlLFxyXG4gICAgICAgIHJlc3VsdDogW10sXHJcbiAgICAgIH07XHJcbiAgICB9XHJcblxyXG4gICAgLy8gcGljbGlzdFxyXG4gICAgaWYgKGRhdGEuZnVsbFJlc3VsdCkge1xyXG4gICAgICBjb25zdCB1cGxvYWRVcmxGdWxsUmVzdWx0TGlzdCA9IGRhdGEuZnVsbFJlc3VsdCB8fCBbXTtcclxuICAgICAgdGhpcy5zZXR0aW5ncy51cGxvYWRlZEltYWdlcyA9IFtcclxuICAgICAgICAuLi4odGhpcy5zZXR0aW5ncy51cGxvYWRlZEltYWdlcyB8fCBbXSksXHJcbiAgICAgICAgLi4udXBsb2FkVXJsRnVsbFJlc3VsdExpc3QsXHJcbiAgICAgIF07XHJcbiAgICAgIHRoaXMucGx1Z2luLnNhdmVTZXR0aW5ncygpO1xyXG4gICAgfVxyXG5cclxuICAgIHJldHVybiB7XHJcbiAgICAgIHN1Y2Nlc3M6IHRydWUsXHJcbiAgICAgIG1zZzogXCJzdWNjZXNzXCIsXHJcbiAgICAgIHJlc3VsdDogdHlwZW9mIGRhdGEucmVzdWx0ID09IFwic3RyaW5nXCIgPyBbZGF0YS5yZXN1bHRdIDogZGF0YS5yZXN1bHQsXHJcbiAgICB9O1xyXG4gIH1cclxuXHJcbiAgYXN5bmMgdXBsb2FkKGZpbGVMaXN0OiBBcnJheTxJbWFnZT4gfCBBcnJheTxzdHJpbmc+KSB7XHJcbiAgICByZXR1cm4gdGhpcy51cGxvYWRGaWxlcyhmaWxlTGlzdCk7XHJcbiAgfVxyXG4gIGFzeW5jIHVwbG9hZEJ5Q2xpcGJvYXJkKGZpbGVMaXN0PzogRmlsZUxpc3QpIHtcclxuICAgIHJldHVybiB0aGlzLnVwbG9hZEZpbGVCeUNsaXBib2FyZChmaWxlTGlzdCk7XHJcbiAgfVxyXG59XHJcbiIsImltcG9ydCB7IGpvaW4gfSBmcm9tIFwicGF0aC1icm93c2VyaWZ5XCI7XHJcblxyXG5pbXBvcnQgeyBzdHJlYW1Ub1N0cmluZywgZ2V0TGFzdEltYWdlIH0gZnJvbSBcIi4uL3V0aWxzXCI7XHJcbmltcG9ydCB7IG5vcm1hbGl6ZVBhdGgsIEZpbGVTeXN0ZW1BZGFwdGVyIH0gZnJvbSBcIm9ic2lkaWFuXCI7XHJcblxyXG5pbXBvcnQgdHlwZSBpbWFnZUF1dG9VcGxvYWRQbHVnaW4gZnJvbSBcIi4uL21haW5cIjtcclxuaW1wb3J0IHR5cGUgeyBJbWFnZSB9IGZyb20gXCIuLi90eXBlc1wiO1xyXG5pbXBvcnQgdHlwZSB7IFBsdWdpblNldHRpbmdzIH0gZnJvbSBcIi4uL3NldHRpbmdcIjtcclxuaW1wb3J0IHR5cGUgeyBVcGxvYWRlciB9IGZyb20gXCIuL3R5cGVzXCI7XHJcblxyXG5leHBvcnQgZGVmYXVsdCBjbGFzcyBQaWNHb0NvcmVVcGxvYWRlciBpbXBsZW1lbnRzIFVwbG9hZGVyIHtcclxuICBzZXR0aW5nczogUGx1Z2luU2V0dGluZ3M7XHJcbiAgcGx1Z2luOiBpbWFnZUF1dG9VcGxvYWRQbHVnaW47XHJcblxyXG4gIGNvbnN0cnVjdG9yKHBsdWdpbjogaW1hZ2VBdXRvVXBsb2FkUGx1Z2luKSB7XHJcbiAgICB0aGlzLnNldHRpbmdzID0gcGx1Z2luLnNldHRpbmdzO1xyXG4gICAgdGhpcy5wbHVnaW4gPSBwbHVnaW47XHJcbiAgfVxyXG5cclxuICBwcml2YXRlIGFzeW5jIHVwbG9hZEZpbGVzKGZpbGVMaXN0OiBBcnJheTxJbWFnZT4gfCBBcnJheTxzdHJpbmc+KSB7XHJcbiAgICBjb25zdCBiYXNlUGF0aCA9IChcclxuICAgICAgdGhpcy5wbHVnaW4uYXBwLnZhdWx0LmFkYXB0ZXIgYXMgRmlsZVN5c3RlbUFkYXB0ZXJcclxuICAgICkuZ2V0QmFzZVBhdGgoKTtcclxuXHJcbiAgICBjb25zdCBsaXN0ID0gZmlsZUxpc3QubWFwKGl0ZW0gPT4ge1xyXG4gICAgICBpZiAodHlwZW9mIGl0ZW0gPT09IFwic3RyaW5nXCIpIHtcclxuICAgICAgICByZXR1cm4gaXRlbTtcclxuICAgICAgfSBlbHNlIHtcclxuICAgICAgICByZXR1cm4gbm9ybWFsaXplUGF0aChqb2luKGJhc2VQYXRoLCBpdGVtLnBhdGgpKTtcclxuICAgICAgfVxyXG4gICAgfSk7XHJcblxyXG4gICAgY29uc3QgbGVuZ3RoID0gbGlzdC5sZW5ndGg7XHJcbiAgICBsZXQgY2xpID0gdGhpcy5zZXR0aW5ncy5waWNnb0NvcmVQYXRoIHx8IFwicGljZ29cIjtcclxuICAgIGxldCBjb21tYW5kID0gYCR7Y2xpfSB1cGxvYWQgJHtsaXN0Lm1hcChpdGVtID0+IGBcIiR7aXRlbX1cImApLmpvaW4oXCIgXCIpfWA7XHJcblxyXG4gICAgY29uc3QgcmVzID0gYXdhaXQgdGhpcy5leGVjKGNvbW1hbmQpO1xyXG4gICAgY29uc3Qgc3BsaXRMaXN0ID0gcmVzLnNwbGl0KFwiXFxuXCIpO1xyXG4gICAgY29uc3Qgc3BsaXRMaXN0TGVuZ3RoID0gc3BsaXRMaXN0Lmxlbmd0aDtcclxuXHJcbiAgICBjb25zdCBkYXRhID0gc3BsaXRMaXN0LnNwbGljZShzcGxpdExpc3RMZW5ndGggLSAxIC0gbGVuZ3RoLCBsZW5ndGgpO1xyXG5cclxuICAgIGlmIChyZXMuaW5jbHVkZXMoXCJQaWNHbyBFUlJPUlwiKSkge1xyXG4gICAgICBjb25zb2xlLmxvZyhjb21tYW5kLCByZXMpO1xyXG5cclxuICAgICAgcmV0dXJuIHtcclxuICAgICAgICBzdWNjZXNzOiBmYWxzZSxcclxuICAgICAgICBtc2c6IFwi5aSx6LSlXCIsXHJcbiAgICAgICAgcmVzdWx0OiBbXSBhcyBzdHJpbmdbXSxcclxuICAgICAgfTtcclxuICAgIH0gZWxzZSB7XHJcbiAgICAgIHJldHVybiB7XHJcbiAgICAgICAgc3VjY2VzczogdHJ1ZSxcclxuICAgICAgICByZXN1bHQ6IGRhdGEsXHJcbiAgICAgIH07XHJcbiAgICB9XHJcbiAgfVxyXG5cclxuICAvLyBQaWNHby1Db3JlIOS4iuS8oOWkhOeQhlxyXG4gIHByaXZhdGUgYXN5bmMgdXBsb2FkRmlsZUJ5Q2xpcGJvYXJkKCkge1xyXG4gICAgY29uc3QgcmVzID0gYXdhaXQgdGhpcy51cGxvYWRCeUNsaXAoKTtcclxuICAgIGNvbnN0IHNwbGl0TGlzdCA9IHJlcy5zcGxpdChcIlxcblwiKTtcclxuICAgIGNvbnN0IGxhc3RJbWFnZSA9IGdldExhc3RJbWFnZShzcGxpdExpc3QpO1xyXG5cclxuICAgIGlmIChsYXN0SW1hZ2UpIHtcclxuICAgICAgcmV0dXJuIHtcclxuICAgICAgICBzdWNjZXNzOiB0cnVlLFxyXG4gICAgICAgIG1zZzogXCJzdWNjZXNzXCIsXHJcbiAgICAgICAgcmVzdWx0OiBbbGFzdEltYWdlXSxcclxuICAgICAgfTtcclxuICAgIH0gZWxzZSB7XHJcbiAgICAgIGNvbnNvbGUubG9nKHNwbGl0TGlzdCk7XHJcblxyXG4gICAgICByZXR1cm4ge1xyXG4gICAgICAgIHN1Y2Nlc3M6IGZhbHNlLFxyXG4gICAgICAgIG1zZzogYFwiUGxlYXNlIGNoZWNrIFBpY0dvLUNvcmUgY29uZmlnXCJcXG4ke3Jlc31gLFxyXG4gICAgICAgIHJlc3VsdDogW10sXHJcbiAgICAgIH07XHJcbiAgICB9XHJcbiAgfVxyXG5cclxuICAvLyBQaWNHby1Db3Jl55qE5Ymq5YiH5LiK5Lyg5Y+N6aaIXHJcbiAgcHJpdmF0ZSBhc3luYyB1cGxvYWRCeUNsaXAoKSB7XHJcbiAgICBsZXQgY29tbWFuZDtcclxuICAgIGlmICh0aGlzLnNldHRpbmdzLnBpY2dvQ29yZVBhdGgpIHtcclxuICAgICAgY29tbWFuZCA9IGAke3RoaXMuc2V0dGluZ3MucGljZ29Db3JlUGF0aH0gdXBsb2FkYDtcclxuICAgIH0gZWxzZSB7XHJcbiAgICAgIGNvbW1hbmQgPSBgcGljZ28gdXBsb2FkYDtcclxuICAgIH1cclxuICAgIGNvbnN0IHJlcyA9IGF3YWl0IHRoaXMuZXhlYyhjb21tYW5kKTtcclxuXHJcbiAgICByZXR1cm4gcmVzO1xyXG4gIH1cclxuXHJcbiAgcHJpdmF0ZSBhc3luYyBleGVjKGNvbW1hbmQ6IHN0cmluZykge1xyXG4gICAgY29uc3QgeyBleGVjIH0gPSByZXF1aXJlKFwiY2hpbGRfcHJvY2Vzc1wiKTtcclxuICAgIGxldCB7IHN0ZG91dCB9ID0gYXdhaXQgZXhlYyhjb21tYW5kKTtcclxuICAgIGNvbnN0IHJlcyA9IGF3YWl0IHN0cmVhbVRvU3RyaW5nKHN0ZG91dCk7XHJcbiAgICByZXR1cm4gcmVzO1xyXG4gIH1cclxuXHJcbiAgcHJpdmF0ZSBhc3luYyBzcGF3bkNoaWxkKCkge1xyXG4gICAgY29uc3QgeyBzcGF3biB9ID0gcmVxdWlyZShcImNoaWxkX3Byb2Nlc3NcIik7XHJcbiAgICBjb25zdCBjaGlsZCA9IHNwYXduKFwicGljZ29cIiwgW1widXBsb2FkXCJdLCB7XHJcbiAgICAgIHNoZWxsOiB0cnVlLFxyXG4gICAgfSk7XHJcblxyXG4gICAgbGV0IGRhdGEgPSBcIlwiO1xyXG4gICAgZm9yIGF3YWl0IChjb25zdCBjaHVuayBvZiBjaGlsZC5zdGRvdXQpIHtcclxuICAgICAgZGF0YSArPSBjaHVuaztcclxuICAgIH1cclxuICAgIGxldCBlcnJvciA9IFwiXCI7XHJcbiAgICBmb3IgYXdhaXQgKGNvbnN0IGNodW5rIG9mIGNoaWxkLnN0ZGVycikge1xyXG4gICAgICBlcnJvciArPSBjaHVuaztcclxuICAgIH1cclxuICAgIGNvbnN0IGV4aXRDb2RlID0gYXdhaXQgbmV3IFByb21pc2UoKHJlc29sdmUsIHJlamVjdCkgPT4ge1xyXG4gICAgICBjaGlsZC5vbihcImNsb3NlXCIsIHJlc29sdmUpO1xyXG4gICAgfSk7XHJcblxyXG4gICAgaWYgKGV4aXRDb2RlKSB7XHJcbiAgICAgIHRocm93IG5ldyBFcnJvcihgc3VicHJvY2VzcyBlcnJvciBleGl0ICR7ZXhpdENvZGV9LCAke2Vycm9yfWApO1xyXG4gICAgfVxyXG4gICAgcmV0dXJuIGRhdGE7XHJcbiAgfVxyXG5cclxuICBhc3luYyB1cGxvYWQoZmlsZUxpc3Q6IEFycmF5PEltYWdlPiB8IEFycmF5PHN0cmluZz4pIHtcclxuICAgIHJldHVybiB0aGlzLnVwbG9hZEZpbGVzKGZpbGVMaXN0KTtcclxuICB9XHJcbiAgYXN5bmMgdXBsb2FkQnlDbGlwYm9hcmQoZmlsZUxpc3Q/OiBGaWxlTGlzdCkge1xyXG4gICAgY29uc29sZS5sb2coXCJ1cGxvYWRCeUNsaXBib2FyZFwiLCBmaWxlTGlzdCk7XHJcbiAgICByZXR1cm4gdGhpcy51cGxvYWRGaWxlQnlDbGlwYm9hcmQoKTtcclxuICB9XHJcbn1cclxuIiwiaW1wb3J0IHsgUGxhdGZvcm0sIE5vdGljZSB9IGZyb20gXCJvYnNpZGlhblwiO1xyXG5cclxuaW1wb3J0IFBpY0dvVXBsb2FkZXIgZnJvbSBcIi4vcGljZ29cIjtcclxuaW1wb3J0IFBpY0dvQ29yZVVwbG9hZGVyIGZyb20gXCIuL3BpY2dvQ29yZVwiO1xyXG5cclxuaW1wb3J0IHR5cGUgSW1hZ2VBdXRvVXBsb2FkUGx1Z2luIGZyb20gXCIuLi9tYWluXCI7XHJcbmltcG9ydCB0eXBlIHsgSW1hZ2UgfSBmcm9tIFwiLi4vdHlwZXNcIjtcclxuXHJcbmV4cG9ydCBmdW5jdGlvbiBnZXRVcGxvYWRlcih1cGxvYWRlcjogc3RyaW5nKSB7XHJcbiAgc3dpdGNoICh1cGxvYWRlcikge1xyXG4gICAgY2FzZSBcIlBpY0dvXCI6XHJcbiAgICAgIHJldHVybiBQaWNHb1VwbG9hZGVyO1xyXG4gICAgY2FzZSBcIlBpY0dvLUNvcmVcIjpcclxuICAgICAgcmV0dXJuIFBpY0dvQ29yZVVwbG9hZGVyO1xyXG4gICAgZGVmYXVsdDpcclxuICAgICAgdGhyb3cgbmV3IEVycm9yKFwiSW52YWxpZCB1cGxvYWRlclwiKTtcclxuICB9XHJcbn1cclxuXHJcbmV4cG9ydCBjbGFzcyBVcGxvYWRlck1hbmFnZXIge1xyXG4gIHVwbG9hZGVyOiBQaWNHb1VwbG9hZGVyIHwgUGljR29Db3JlVXBsb2FkZXI7XHJcbiAgcGx1Z2luOiBJbWFnZUF1dG9VcGxvYWRQbHVnaW47XHJcblxyXG4gIGNvbnN0cnVjdG9yKHVwbG9hZGVyOiBzdHJpbmcsIHBsdWdpbjogSW1hZ2VBdXRvVXBsb2FkUGx1Z2luKSB7XHJcbiAgICB0aGlzLnBsdWdpbiA9IHBsdWdpbjtcclxuICAgIGNvbnN0IFVwbG9hZGVyID0gZ2V0VXBsb2FkZXIodXBsb2FkZXIpO1xyXG4gICAgdGhpcy51cGxvYWRlciA9IG5ldyBVcGxvYWRlcih0aGlzLnBsdWdpbik7XHJcbiAgfVxyXG5cclxuICBhc3luYyB1cGxvYWQoZmlsZUxpc3Q6IEFycmF5PHN0cmluZz4gfCBBcnJheTxJbWFnZT4pIHtcclxuICAgIGlmIChQbGF0Zm9ybS5pc01vYmlsZUFwcCAmJiAhdGhpcy5wbHVnaW4uc2V0dGluZ3MucmVtb3RlU2VydmVyTW9kZSkge1xyXG4gICAgICBuZXcgTm90aWNlKFwiTW9iaWxlIEFwcCBtdXN0IHVzZSByZW1vdGUgc2VydmVyIG1vZGUuXCIpO1xyXG4gICAgICB0aHJvdyBuZXcgRXJyb3IoXCJNb2JpbGUgQXBwIG11c3QgdXNlIHJlbW90ZSBzZXJ2ZXIgbW9kZS5cIik7XHJcbiAgICB9XHJcblxyXG4gICAgY29uc3QgcmVzID0gYXdhaXQgdGhpcy51cGxvYWRlci51cGxvYWQoZmlsZUxpc3QpO1xyXG4gICAgaWYgKCFyZXMuc3VjY2Vzcykge1xyXG4gICAgICBuZXcgTm90aWNlKHJlcy5tc2cgfHwgXCJVcGxvYWQgRmFpbGVkXCIpO1xyXG4gICAgICB0aHJvdyBuZXcgRXJyb3IocmVzLm1zZyB8fCBcIlVwbG9hZCBGYWlsZWRcIik7XHJcbiAgICB9XHJcblxyXG4gICAgcmV0dXJuIHJlcztcclxuICB9XHJcbiAgYXN5bmMgdXBsb2FkQnlDbGlwYm9hcmQoZmlsZUxpc3Q/OiBGaWxlTGlzdCkge1xyXG4gICAgaWYgKFBsYXRmb3JtLmlzTW9iaWxlQXBwICYmICF0aGlzLnBsdWdpbi5zZXR0aW5ncy5yZW1vdGVTZXJ2ZXJNb2RlKSB7XHJcbiAgICAgIG5ldyBOb3RpY2UoXCJNb2JpbGUgQXBwIG11c3QgdXNlIHJlbW90ZSBzZXJ2ZXIgbW9kZS5cIik7XHJcbiAgICAgIHRocm93IG5ldyBFcnJvcihcIk1vYmlsZSBBcHAgbXVzdCB1c2UgcmVtb3RlIHNlcnZlciBtb2RlLlwiKTtcclxuICAgIH1cclxuXHJcbiAgICBjb25zdCByZXMgPSBhd2FpdCB0aGlzLnVwbG9hZGVyLnVwbG9hZEJ5Q2xpcGJvYXJkKGZpbGVMaXN0KTtcclxuICAgIGlmICghcmVzLnN1Y2Nlc3MpIHtcclxuICAgICAgbmV3IE5vdGljZShyZXMubXNnIHx8IFwiVXBsb2FkIEZhaWxlZFwiKTtcclxuICAgICAgdGhyb3cgbmV3IEVycm9yKHJlcy5tc2cgfHwgXCJVcGxvYWQgRmFpbGVkXCIpO1xyXG4gICAgfVxyXG5cclxuICAgIHJldHVybiByZXM7XHJcbiAgfVxyXG59XHJcblxyXG5leHBvcnQgdHlwZSBVcGxvYWRlciA9IFBpY0dvVXBsb2FkZXIgfCBQaWNHb0NvcmVVcGxvYWRlcjtcclxuZXhwb3J0IHsgUGljR29VcGxvYWRlciwgUGljR29Db3JlVXBsb2FkZXIgfTtcclxuIiwiaW1wb3J0IHsgSVN0cmluZ0tleU1hcCB9IGZyb20gXCIuL3V0aWxzXCI7XHJcbmltcG9ydCB7IHJlcXVlc3RVcmwgfSBmcm9tIFwib2JzaWRpYW5cIjtcclxuaW1wb3J0IGltYWdlQXV0b1VwbG9hZFBsdWdpbiBmcm9tIFwiLi9tYWluXCI7XHJcblxyXG5leHBvcnQgY2xhc3MgUGljR29EZWxldGVyIHtcclxuICBwbHVnaW46IGltYWdlQXV0b1VwbG9hZFBsdWdpbjtcclxuXHJcbiAgY29uc3RydWN0b3IocGx1Z2luOiBpbWFnZUF1dG9VcGxvYWRQbHVnaW4pIHtcclxuICAgIHRoaXMucGx1Z2luID0gcGx1Z2luO1xyXG4gIH1cclxuXHJcbiAgYXN5bmMgZGVsZXRlSW1hZ2UoY29uZmlnTWFwOiBJU3RyaW5nS2V5TWFwPGFueT5bXSkge1xyXG4gICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCByZXF1ZXN0VXJsKHtcclxuICAgICAgdXJsOiB0aGlzLnBsdWdpbi5zZXR0aW5ncy5kZWxldGVTZXJ2ZXIsXHJcbiAgICAgIG1ldGhvZDogXCJQT1NUXCIsXHJcbiAgICAgIGhlYWRlcnM6IHsgXCJDb250ZW50LVR5cGVcIjogXCJhcHBsaWNhdGlvbi9qc29uXCIgfSxcclxuICAgICAgYm9keTogSlNPTi5zdHJpbmdpZnkoe1xyXG4gICAgICAgIGxpc3Q6IGNvbmZpZ01hcCxcclxuICAgICAgfSksXHJcbiAgICB9KTtcclxuICAgIGNvbnN0IGRhdGEgPSByZXNwb25zZS5qc29uO1xyXG4gICAgcmV0dXJuIGRhdGE7XHJcbiAgfVxyXG59XHJcbiIsImltcG9ydCB7IE1hcmtkb3duVmlldywgQXBwIH0gZnJvbSBcIm9ic2lkaWFuXCI7XHJcbmltcG9ydCB7IHBhcnNlIH0gZnJvbSBcInBhdGgtYnJvd3NlcmlmeVwiO1xyXG5cclxuaW50ZXJmYWNlIEltYWdlIHtcclxuICBwYXRoOiBzdHJpbmc7XHJcbiAgbmFtZTogc3RyaW5nO1xyXG4gIHNvdXJjZTogc3RyaW5nO1xyXG59XHJcbi8vICFbXSguL2RzYS9hYS5wbmcpIGxvY2FsIGltYWdlIHNob3VsZCBoYXMgZXh0LCBzdXBwb3J0ICFbXSg8Li9kc2EvYWEucG5nPiksIHN1cHBvcnQgIVtdKGltYWdlLnBuZyBcImFsdFwiKVxyXG4vLyAhW10oaHR0cHM6Ly9kYXNkYXNkYSkgaW50ZXJuZXQgaW1hZ2Ugc2hvdWxkIG5vdCBoYXMgZXh0XHJcbmNvbnN0IFJFR0VYX0ZJTEUgPVxyXG4gIC9cXCFcXFsoLio/KVxcXVxcKDwoXFxTK1xcLlxcdyspPlxcKXxcXCFcXFsoLio/KVxcXVxcKChcXFMrXFwuXFx3KykoPzpcXHMrXCJbXlwiXSpcIik/XFwpfFxcIVxcWyguKj8pXFxdXFwoKGh0dHBzPzpcXC9cXC8uKj8pXFwpL2c7XHJcbmNvbnN0IFJFR0VYX1dJS0lfRklMRSA9IC9cXCFcXFtcXFsoLio/KShcXHMqP1xcfC4qPyk/XFxdXFxdL2c7XHJcblxyXG5leHBvcnQgZGVmYXVsdCBjbGFzcyBIZWxwZXIge1xyXG4gIGFwcDogQXBwO1xyXG5cclxuICBjb25zdHJ1Y3RvcihhcHA6IEFwcCkge1xyXG4gICAgdGhpcy5hcHAgPSBhcHA7XHJcbiAgfVxyXG5cclxuICBnZXRGcm9udG1hdHRlclZhbHVlKGtleTogc3RyaW5nLCBkZWZhdWx0VmFsdWU6IGFueSA9IHVuZGVmaW5lZCkge1xyXG4gICAgY29uc3QgZmlsZSA9IHRoaXMuYXBwLndvcmtzcGFjZS5nZXRBY3RpdmVGaWxlKCk7XHJcbiAgICBpZiAoIWZpbGUpIHtcclxuICAgICAgcmV0dXJuIHVuZGVmaW5lZDtcclxuICAgIH1cclxuICAgIGNvbnN0IHBhdGggPSBmaWxlLnBhdGg7XHJcbiAgICBjb25zdCBjYWNoZSA9IHRoaXMuYXBwLm1ldGFkYXRhQ2FjaGUuZ2V0Q2FjaGUocGF0aCk7XHJcblxyXG4gICAgbGV0IHZhbHVlID0gZGVmYXVsdFZhbHVlO1xyXG4gICAgaWYgKGNhY2hlPy5mcm9udG1hdHRlciAmJiBjYWNoZS5mcm9udG1hdHRlci5oYXNPd25Qcm9wZXJ0eShrZXkpKSB7XHJcbiAgICAgIHZhbHVlID0gY2FjaGUuZnJvbnRtYXR0ZXJba2V5XTtcclxuICAgIH1cclxuICAgIHJldHVybiB2YWx1ZTtcclxuICB9XHJcblxyXG4gIGdldEVkaXRvcigpIHtcclxuICAgIGNvbnN0IG1kVmlldyA9IHRoaXMuYXBwLndvcmtzcGFjZS5nZXRBY3RpdmVWaWV3T2ZUeXBlKE1hcmtkb3duVmlldyk7XHJcbiAgICBpZiAobWRWaWV3KSB7XHJcbiAgICAgIHJldHVybiBtZFZpZXcuZWRpdG9yO1xyXG4gICAgfSBlbHNlIHtcclxuICAgICAgcmV0dXJuIG51bGw7XHJcbiAgICB9XHJcbiAgfVxyXG5cclxuICBnZXRWYWx1ZSgpIHtcclxuICAgIGNvbnN0IGVkaXRvciA9IHRoaXMuZ2V0RWRpdG9yKCk7XHJcbiAgICByZXR1cm4gZWRpdG9yLmdldFZhbHVlKCk7XHJcbiAgfVxyXG5cclxuICBzZXRWYWx1ZSh2YWx1ZTogc3RyaW5nKSB7XHJcbiAgICBjb25zdCBlZGl0b3IgPSB0aGlzLmdldEVkaXRvcigpO1xyXG4gICAgY29uc3QgeyBsZWZ0LCB0b3AgfSA9IGVkaXRvci5nZXRTY3JvbGxJbmZvKCk7XHJcbiAgICBjb25zdCBwb3NpdGlvbiA9IGVkaXRvci5nZXRDdXJzb3IoKTtcclxuXHJcbiAgICBlZGl0b3Iuc2V0VmFsdWUodmFsdWUpO1xyXG4gICAgZWRpdG9yLnNjcm9sbFRvKGxlZnQsIHRvcCk7XHJcbiAgICBlZGl0b3Iuc2V0Q3Vyc29yKHBvc2l0aW9uKTtcclxuICB9XHJcblxyXG4gIC8vIGdldCBhbGwgZmlsZSB1cmxzLCBpbmNsdWRlIGxvY2FsIGFuZCBpbnRlcm5ldFxyXG4gIGdldEFsbEZpbGVzKCk6IEltYWdlW10ge1xyXG4gICAgY29uc3QgZWRpdG9yID0gdGhpcy5nZXRFZGl0b3IoKTtcclxuICAgIGxldCB2YWx1ZSA9IGVkaXRvci5nZXRWYWx1ZSgpO1xyXG4gICAgcmV0dXJuIHRoaXMuZ2V0SW1hZ2VMaW5rKHZhbHVlKTtcclxuICB9XHJcblxyXG4gIGdldEltYWdlTGluayh2YWx1ZTogc3RyaW5nKTogSW1hZ2VbXSB7XHJcbiAgICBjb25zdCBtYXRjaGVzID0gdmFsdWUubWF0Y2hBbGwoUkVHRVhfRklMRSk7XHJcbiAgICBjb25zdCBXaWtpTWF0Y2hlcyA9IHZhbHVlLm1hdGNoQWxsKFJFR0VYX1dJS0lfRklMRSk7XHJcblxyXG4gICAgbGV0IGZpbGVBcnJheTogSW1hZ2VbXSA9IFtdO1xyXG5cclxuICAgIGZvciAoY29uc3QgbWF0Y2ggb2YgbWF0Y2hlcykge1xyXG4gICAgICBjb25zdCBzb3VyY2UgPSBtYXRjaFswXTtcclxuXHJcbiAgICAgIGxldCBuYW1lID0gbWF0Y2hbMV07XHJcbiAgICAgIGxldCBwYXRoID0gbWF0Y2hbMl07XHJcbiAgICAgIGlmIChuYW1lID09PSB1bmRlZmluZWQpIHtcclxuICAgICAgICBuYW1lID0gbWF0Y2hbM107XHJcbiAgICAgIH1cclxuICAgICAgaWYgKHBhdGggPT09IHVuZGVmaW5lZCkge1xyXG4gICAgICAgIHBhdGggPSBtYXRjaFs0XTtcclxuICAgICAgfVxyXG5cclxuICAgICAgZmlsZUFycmF5LnB1c2goe1xyXG4gICAgICAgIHBhdGg6IHBhdGgsXHJcbiAgICAgICAgbmFtZTogbmFtZSxcclxuICAgICAgICBzb3VyY2U6IHNvdXJjZSxcclxuICAgICAgfSk7XHJcbiAgICB9XHJcblxyXG4gICAgZm9yIChjb25zdCBtYXRjaCBvZiBXaWtpTWF0Y2hlcykge1xyXG4gICAgICBsZXQgbmFtZSA9IHBhcnNlKG1hdGNoWzFdKS5uYW1lO1xyXG4gICAgICBjb25zdCBwYXRoID0gbWF0Y2hbMV07XHJcbiAgICAgIGNvbnN0IHNvdXJjZSA9IG1hdGNoWzBdO1xyXG4gICAgICBpZiAobWF0Y2hbMl0pIHtcclxuICAgICAgICBuYW1lID0gYCR7bmFtZX0ke21hdGNoWzJdfWA7XHJcbiAgICAgIH1cclxuICAgICAgZmlsZUFycmF5LnB1c2goe1xyXG4gICAgICAgIHBhdGg6IHBhdGgsXHJcbiAgICAgICAgbmFtZTogbmFtZSxcclxuICAgICAgICBzb3VyY2U6IHNvdXJjZSxcclxuICAgICAgfSk7XHJcbiAgICB9XHJcblxyXG4gICAgcmV0dXJuIGZpbGVBcnJheTtcclxuICB9XHJcblxyXG4gIGhhc0JsYWNrRG9tYWluKHNyYzogc3RyaW5nLCBibGFja0RvbWFpbnM6IHN0cmluZykge1xyXG4gICAgaWYgKGJsYWNrRG9tYWlucy50cmltKCkgPT09IFwiXCIpIHtcclxuICAgICAgcmV0dXJuIGZhbHNlO1xyXG4gICAgfVxyXG4gICAgY29uc3QgYmxhY2tEb21haW5MaXN0ID0gYmxhY2tEb21haW5zLnNwbGl0KFwiLFwiKS5maWx0ZXIoaXRlbSA9PiBpdGVtICE9PSBcIlwiKTtcclxuICAgIGxldCB1cmwgPSBuZXcgVVJMKHNyYyk7XHJcbiAgICBjb25zdCBkb21haW4gPSB1cmwuaG9zdG5hbWU7XHJcblxyXG4gICAgcmV0dXJuIGJsYWNrRG9tYWluTGlzdC5zb21lKGJsYWNrRG9tYWluID0+IGRvbWFpbi5pbmNsdWRlcyhibGFja0RvbWFpbikpO1xyXG4gIH1cclxufVxyXG4iLCJpbXBvcnQgeyBBcHAsIFBsdWdpblNldHRpbmdUYWIsIFNldHRpbmcsIE5vdGljZSwgUGxhdGZvcm0gfSBmcm9tIFwib2JzaWRpYW5cIjtcclxuaW1wb3J0IGltYWdlQXV0b1VwbG9hZFBsdWdpbiBmcm9tIFwiLi9tYWluXCI7XHJcbmltcG9ydCB7IHQgfSBmcm9tIFwiLi9sYW5nL2hlbHBlcnNcIjtcclxuXHJcbmV4cG9ydCBpbnRlcmZhY2UgUGx1Z2luU2V0dGluZ3Mge1xyXG4gIHVwbG9hZEJ5Q2xpcFN3aXRjaDogYm9vbGVhbjtcclxuICB1cGxvYWRTZXJ2ZXI6IHN0cmluZztcclxuICBkZWxldGVTZXJ2ZXI6IHN0cmluZztcclxuICBpbWFnZVNpemVTdWZmaXg6IHN0cmluZztcclxuICB1cGxvYWRlcjogc3RyaW5nO1xyXG4gIHBpY2dvQ29yZVBhdGg6IHN0cmluZztcclxuICB3b3JrT25OZXRXb3JrOiBib29sZWFuO1xyXG4gIG5ld1dvcmtCbGFja0RvbWFpbnM6IHN0cmluZztcclxuICBhcHBseUltYWdlOiBib29sZWFuO1xyXG4gIGRlbGV0ZVNvdXJjZTogYm9vbGVhbjtcclxuICBpbWFnZURlc2M6IFwib3JpZ2luXCIgfCBcIm5vbmVcIiB8IFwicmVtb3ZlRGVmYXVsdFwiO1xyXG4gIHJlbW90ZVNlcnZlck1vZGU6IGJvb2xlYW47XHJcbiAgYWRkUGFuZG9jRmlnOiBib29sZWFuO1xyXG4gIGFkZE5ld0xpbmVBcm91bmRJbWFnZTogYm9vbGVhbjtcclxuICBwYW5kb2NJbWFnZVdpZHRoOiBzdHJpbmc7XHJcbiAgW3Byb3BOYW1lOiBzdHJpbmddOiBhbnk7XHJcbn1cclxuXHJcbmV4cG9ydCBjb25zdCBERUZBVUxUX1NFVFRJTkdTOiBQbHVnaW5TZXR0aW5ncyA9IHtcclxuICB1cGxvYWRCeUNsaXBTd2l0Y2g6IHRydWUsXHJcbiAgdXBsb2FkZXI6IFwiUGljR29cIixcclxuICB1cGxvYWRTZXJ2ZXI6IFwiaHR0cDovLzEyNy4wLjAuMTozNjY3Ny91cGxvYWRcIixcclxuICBkZWxldGVTZXJ2ZXI6IFwiaHR0cDovLzEyNy4wLjAuMTozNjY3Ny9kZWxldGVcIixcclxuICBpbWFnZVNpemVTdWZmaXg6IFwiXCIsXHJcbiAgcGljZ29Db3JlUGF0aDogXCJcIixcclxuICB3b3JrT25OZXRXb3JrOiBmYWxzZSxcclxuICBhcHBseUltYWdlOiB0cnVlLFxyXG4gIG5ld1dvcmtCbGFja0RvbWFpbnM6IFwiXCIsXHJcbiAgZGVsZXRlU291cmNlOiBmYWxzZSxcclxuICBpbWFnZURlc2M6IFwib3JpZ2luXCIsXHJcbiAgcmVtb3RlU2VydmVyTW9kZTogZmFsc2UsXHJcbiAgYWRkUGFuZG9jRmlnOiBmYWxzZSxcclxuICBhZGROZXdMaW5lQXJvdW5kSW1hZ2U6IHRydWUsICAvLyBb5paw5aKeXSDpu5jorqTlvIDlkK/oh6rliqjmjaLooYxcclxuICBwYW5kb2NJbWFnZVdpZHRoOiBcIjE0Y21cIixcclxufTtcclxuXHJcbmV4cG9ydCBjbGFzcyBTZXR0aW5nVGFiIGV4dGVuZHMgUGx1Z2luU2V0dGluZ1RhYiB7XHJcbiAgcGx1Z2luOiBpbWFnZUF1dG9VcGxvYWRQbHVnaW47XHJcblxyXG4gIGNvbnN0cnVjdG9yKGFwcDogQXBwLCBwbHVnaW46IGltYWdlQXV0b1VwbG9hZFBsdWdpbikge1xyXG4gICAgc3VwZXIoYXBwLCBwbHVnaW4pO1xyXG4gICAgdGhpcy5wbHVnaW4gPSBwbHVnaW47XHJcbiAgfVxyXG5cclxuICBkaXNwbGF5KCk6IHZvaWQge1xyXG4gICAgbGV0IHsgY29udGFpbmVyRWwgfSA9IHRoaXM7XHJcblxyXG4gICAgY29udGFpbmVyRWwuZW1wdHkoKTtcclxuICAgIGNvbnRhaW5lckVsLmNyZWF0ZUVsKFwiaDJcIiwgeyB0ZXh0OiB0KFwiUGx1Z2luIFNldHRpbmdzXCIpIH0pO1xyXG4gICAgbmV3IFNldHRpbmcoY29udGFpbmVyRWwpXHJcbiAgICAgIC5zZXROYW1lKHQoXCJBdXRvIHBhc3RlZCB1cGxvYWRcIikpXHJcbiAgICAgIC5zZXREZXNjKFxyXG4gICAgICAgIHQoXHJcbiAgICAgICAgICBcIklmIHlvdSBzZXQgdGhpcyB2YWx1ZSB0cnVlLCB3aGVuIHlvdSBwYXN0ZSBpbWFnZSwgaXQgd2lsbCBiZSBhdXRvIHVwbG9hZGVkKHlvdSBzaG91bGQgc2V0IHRoZSBwaWNHbyBzZXJ2ZXIgcmlnaHRseSlcIlxyXG4gICAgICAgIClcclxuICAgICAgKVxyXG4gICAgICAuYWRkVG9nZ2xlKHRvZ2dsZSA9PlxyXG4gICAgICAgIHRvZ2dsZVxyXG4gICAgICAgICAgLnNldFZhbHVlKHRoaXMucGx1Z2luLnNldHRpbmdzLnVwbG9hZEJ5Q2xpcFN3aXRjaClcclxuICAgICAgICAgIC5vbkNoYW5nZShhc3luYyB2YWx1ZSA9PiB7XHJcbiAgICAgICAgICAgIHRoaXMucGx1Z2luLnNldHRpbmdzLnVwbG9hZEJ5Q2xpcFN3aXRjaCA9IHZhbHVlO1xyXG4gICAgICAgICAgICBhd2FpdCB0aGlzLnBsdWdpbi5zYXZlU2V0dGluZ3MoKTtcclxuICAgICAgICAgIH0pXHJcbiAgICAgICk7XHJcblxyXG4gICAgbmV3IFNldHRpbmcoY29udGFpbmVyRWwpXHJcbiAgICAgIC5zZXROYW1lKHQoXCJEZWZhdWx0IHVwbG9hZGVyXCIpKVxyXG4gICAgICAuc2V0RGVzYyh0KFwiRGVmYXVsdCB1cGxvYWRlclwiKSlcclxuICAgICAgLmFkZERyb3Bkb3duKGNiID0+XHJcbiAgICAgICAgY2JcclxuICAgICAgICAgIC5hZGRPcHRpb24oXCJQaWNHb1wiLCBcIlBpY0dvKGFwcClcIilcclxuICAgICAgICAgIC5hZGRPcHRpb24oXCJQaWNHby1Db3JlXCIsIFwiUGljR28tQ29yZVwiKVxyXG4gICAgICAgICAgLnNldFZhbHVlKHRoaXMucGx1Z2luLnNldHRpbmdzLnVwbG9hZGVyKVxyXG4gICAgICAgICAgLm9uQ2hhbmdlKGFzeW5jIHZhbHVlID0+IHtcclxuICAgICAgICAgICAgdGhpcy5wbHVnaW4uc2V0dGluZ3MudXBsb2FkZXIgPSB2YWx1ZTtcclxuICAgICAgICAgICAgdGhpcy5kaXNwbGF5KCk7XHJcbiAgICAgICAgICAgIGF3YWl0IHRoaXMucGx1Z2luLnNhdmVTZXR0aW5ncygpO1xyXG4gICAgICAgICAgfSlcclxuICAgICAgKTtcclxuXHJcbiAgICBpZiAodGhpcy5wbHVnaW4uc2V0dGluZ3MudXBsb2FkZXIgPT09IFwiUGljR29cIikge1xyXG4gICAgICBuZXcgU2V0dGluZyhjb250YWluZXJFbClcclxuICAgICAgICAuc2V0TmFtZSh0KFwiUGljR28gc2VydmVyXCIpKVxyXG4gICAgICAgIC5zZXREZXNjKHQoXCJQaWNHbyBzZXJ2ZXIgZGVzY1wiKSlcclxuICAgICAgICAuYWRkVGV4dCh0ZXh0ID0+XHJcbiAgICAgICAgICB0ZXh0XHJcbiAgICAgICAgICAgIC5zZXRQbGFjZWhvbGRlcih0KFwiUGxlYXNlIGlucHV0IFBpY0dvIHNlcnZlclwiKSlcclxuICAgICAgICAgICAgLnNldFZhbHVlKHRoaXMucGx1Z2luLnNldHRpbmdzLnVwbG9hZFNlcnZlcilcclxuICAgICAgICAgICAgLm9uQ2hhbmdlKGFzeW5jIGtleSA9PiB7XHJcbiAgICAgICAgICAgICAgdGhpcy5wbHVnaW4uc2V0dGluZ3MudXBsb2FkU2VydmVyID0ga2V5O1xyXG4gICAgICAgICAgICAgIGF3YWl0IHRoaXMucGx1Z2luLnNhdmVTZXR0aW5ncygpO1xyXG4gICAgICAgICAgICB9KVxyXG4gICAgICAgICk7XHJcblxyXG4gICAgICBuZXcgU2V0dGluZyhjb250YWluZXJFbClcclxuICAgICAgICAuc2V0TmFtZSh0KFwiUGljR28gZGVsZXRlIHNlcnZlclwiKSlcclxuICAgICAgICAuc2V0RGVzYyh0KFwiUGljTGlzdCBkZXNjXCIpKVxyXG4gICAgICAgIC5hZGRUZXh0KHRleHQgPT5cclxuICAgICAgICAgIHRleHRcclxuICAgICAgICAgICAgLnNldFBsYWNlaG9sZGVyKHQoXCJQbGVhc2UgaW5wdXQgUGljR28gZGVsZXRlIHNlcnZlclwiKSlcclxuICAgICAgICAgICAgLnNldFZhbHVlKHRoaXMucGx1Z2luLnNldHRpbmdzLmRlbGV0ZVNlcnZlcilcclxuICAgICAgICAgICAgLm9uQ2hhbmdlKGFzeW5jIGtleSA9PiB7XHJcbiAgICAgICAgICAgICAgdGhpcy5wbHVnaW4uc2V0dGluZ3MuZGVsZXRlU2VydmVyID0ga2V5O1xyXG4gICAgICAgICAgICAgIGF3YWl0IHRoaXMucGx1Z2luLnNhdmVTZXR0aW5ncygpO1xyXG4gICAgICAgICAgICB9KVxyXG4gICAgICAgICk7XHJcbiAgICB9XHJcblxyXG4gICAgbmV3IFNldHRpbmcoY29udGFpbmVyRWwpXHJcbiAgICAgIC5zZXROYW1lKHQoXCJSZW1vdGUgc2VydmVyIG1vZGVcIikpXHJcbiAgICAgIC5zZXREZXNjKHQoXCJSZW1vdGUgc2VydmVyIG1vZGUgZGVzY1wiKSlcclxuICAgICAgLmFkZFRvZ2dsZSh0b2dnbGUgPT5cclxuICAgICAgICB0b2dnbGVcclxuICAgICAgICAgIC5zZXRWYWx1ZSh0aGlzLnBsdWdpbi5zZXR0aW5ncy5yZW1vdGVTZXJ2ZXJNb2RlKVxyXG4gICAgICAgICAgLm9uQ2hhbmdlKGFzeW5jIHZhbHVlID0+IHtcclxuICAgICAgICAgICAgdGhpcy5wbHVnaW4uc2V0dGluZ3MucmVtb3RlU2VydmVyTW9kZSA9IHZhbHVlO1xyXG4gICAgICAgICAgICBpZiAodmFsdWUpIHtcclxuICAgICAgICAgICAgICB0aGlzLnBsdWdpbi5zZXR0aW5ncy53b3JrT25OZXRXb3JrID0gZmFsc2U7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgdGhpcy5kaXNwbGF5KCk7XHJcbiAgICAgICAgICAgIGF3YWl0IHRoaXMucGx1Z2luLnNhdmVTZXR0aW5ncygpO1xyXG4gICAgICAgICAgfSlcclxuICAgICAgKTtcclxuXHJcbiAgICBpZiAodGhpcy5wbHVnaW4uc2V0dGluZ3MudXBsb2FkZXIgPT09IFwiUGljR28tQ29yZVwiKSB7XHJcbiAgICAgIG5ldyBTZXR0aW5nKGNvbnRhaW5lckVsKVxyXG4gICAgICAgIC5zZXROYW1lKHQoXCJQaWNHby1Db3JlIHBhdGhcIikpXHJcbiAgICAgICAgLnNldERlc2MoXHJcbiAgICAgICAgICB0KFwiUGxlYXNlIGlucHV0IFBpY0dvLUNvcmUgcGF0aCwgZGVmYXVsdCB1c2luZyBlbnZpcm9ubWVudCB2YXJpYWJsZXNcIilcclxuICAgICAgICApXHJcbiAgICAgICAgLmFkZFRleHQodGV4dCA9PlxyXG4gICAgICAgICAgdGV4dFxyXG4gICAgICAgICAgICAuc2V0UGxhY2Vob2xkZXIoXCJcIilcclxuICAgICAgICAgICAgLnNldFZhbHVlKHRoaXMucGx1Z2luLnNldHRpbmdzLnBpY2dvQ29yZVBhdGgpXHJcbiAgICAgICAgICAgIC5vbkNoYW5nZShhc3luYyB2YWx1ZSA9PiB7XHJcbiAgICAgICAgICAgICAgdGhpcy5wbHVnaW4uc2V0dGluZ3MucGljZ29Db3JlUGF0aCA9IHZhbHVlO1xyXG4gICAgICAgICAgICAgIGF3YWl0IHRoaXMucGx1Z2luLnNhdmVTZXR0aW5ncygpO1xyXG4gICAgICAgICAgICB9KVxyXG4gICAgICAgICk7XHJcbiAgICB9XHJcblxyXG4gICAgLy8gaW1hZ2UgZGVzYyBzZXR0aW5nXHJcbiAgICBuZXcgU2V0dGluZyhjb250YWluZXJFbClcclxuICAgICAgLnNldE5hbWUodChcIkltYWdlIGRlc2NcIikpXHJcbiAgICAgIC5zZXREZXNjKHQoXCJJbWFnZSBkZXNjXCIpKVxyXG4gICAgICAuYWRkRHJvcGRvd24oY2IgPT5cclxuICAgICAgICBjYlxyXG4gICAgICAgICAgLmFkZE9wdGlvbihcIm9yaWdpblwiLCB0KFwicmVzZXJ2ZVwiKSkgLy8g5L+d55WZ5YWo6YOoXHJcbiAgICAgICAgICAuYWRkT3B0aW9uKFwibm9uZVwiLCB0KFwicmVtb3ZlIGFsbFwiKSkgLy8g56e76Zmk5YWo6YOoXHJcbiAgICAgICAgICAuYWRkT3B0aW9uKFwicmVtb3ZlRGVmYXVsdFwiLCB0KFwicmVtb3ZlIGRlZmF1bHRcIikpIC8vIOWPquenu+mZpOm7mOiupOWNsyBpbWFnZS5wbmdcclxuICAgICAgICAgIC5zZXRWYWx1ZSh0aGlzLnBsdWdpbi5zZXR0aW5ncy5pbWFnZURlc2MpXHJcbiAgICAgICAgICAub25DaGFuZ2UoYXN5bmMgKHZhbHVlOiBcIm9yaWdpblwiIHwgXCJub25lXCIgfCBcInJlbW92ZURlZmF1bHRcIikgPT4ge1xyXG4gICAgICAgICAgICB0aGlzLnBsdWdpbi5zZXR0aW5ncy5pbWFnZURlc2MgPSB2YWx1ZTtcclxuICAgICAgICAgICAgdGhpcy5kaXNwbGF5KCk7XHJcbiAgICAgICAgICAgIGF3YWl0IHRoaXMucGx1Z2luLnNhdmVTZXR0aW5ncygpO1xyXG4gICAgICAgICAgfSlcclxuICAgICAgKTtcclxuXHJcbiAgICBuZXcgU2V0dGluZyhjb250YWluZXJFbClcclxuICAgICAgLnNldE5hbWUodChcIkltYWdlIHNpemUgc3VmZml4XCIpKVxyXG4gICAgICAuc2V0RGVzYyh0KFwiSW1hZ2Ugc2l6ZSBzdWZmaXggRGVzY3JpcHRpb25cIikpXHJcbiAgICAgIC5hZGRUZXh0KHRleHQgPT5cclxuICAgICAgICB0ZXh0XHJcbiAgICAgICAgICAuc2V0UGxhY2Vob2xkZXIodChcIlBsZWFzZSBpbnB1dCBpbWFnZSBzaXplIHN1ZmZpeFwiKSlcclxuICAgICAgICAgIC5zZXRWYWx1ZSh0aGlzLnBsdWdpbi5zZXR0aW5ncy5pbWFnZVNpemVTdWZmaXgpXHJcbiAgICAgICAgICAub25DaGFuZ2UoYXN5bmMga2V5ID0+IHtcclxuICAgICAgICAgICAgdGhpcy5wbHVnaW4uc2V0dGluZ3MuaW1hZ2VTaXplU3VmZml4ID0ga2V5O1xyXG4gICAgICAgICAgICBhd2FpdCB0aGlzLnBsdWdpbi5zYXZlU2V0dGluZ3MoKTtcclxuICAgICAgICAgIH0pXHJcbiAgICAgICk7XHJcblxyXG4gICAgbmV3IFNldHRpbmcoY29udGFpbmVyRWwpXHJcbiAgICAgIC5zZXROYW1lKHQoXCJXb3JrIG9uIG5ldHdvcmtcIikpXHJcbiAgICAgIC5zZXREZXNjKHQoXCJXb3JrIG9uIG5ldHdvcmsgRGVzY3JpcHRpb25cIikpXHJcbiAgICAgIC5hZGRUb2dnbGUodG9nZ2xlID0+XHJcbiAgICAgICAgdG9nZ2xlXHJcbiAgICAgICAgICAuc2V0VmFsdWUodGhpcy5wbHVnaW4uc2V0dGluZ3Mud29ya09uTmV0V29yaylcclxuICAgICAgICAgIC5vbkNoYW5nZShhc3luYyB2YWx1ZSA9PiB7XHJcbiAgICAgICAgICAgIGlmICh0aGlzLnBsdWdpbi5zZXR0aW5ncy5yZW1vdGVTZXJ2ZXJNb2RlKSB7XHJcbiAgICAgICAgICAgICAgbmV3IE5vdGljZShcIkNhbiBvbmx5IHdvcmsgd2hlbiByZW1vdGUgc2VydmVyIG1vZGUgaXMgb2ZmLlwiKTtcclxuICAgICAgICAgICAgICB0aGlzLnBsdWdpbi5zZXR0aW5ncy53b3JrT25OZXRXb3JrID0gZmFsc2U7XHJcbiAgICAgICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgICAgdGhpcy5wbHVnaW4uc2V0dGluZ3Mud29ya09uTmV0V29yayA9IHZhbHVlO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIHRoaXMuZGlzcGxheSgpO1xyXG4gICAgICAgICAgICBhd2FpdCB0aGlzLnBsdWdpbi5zYXZlU2V0dGluZ3MoKTtcclxuICAgICAgICAgIH0pXHJcbiAgICAgICk7XHJcblxyXG4gICAgbmV3IFNldHRpbmcoY29udGFpbmVyRWwpXHJcbiAgICAgIC5zZXROYW1lKHQoXCJOZXR3b3JrIERvbWFpbiBCbGFjayBMaXN0XCIpKVxyXG4gICAgICAuc2V0RGVzYyh0KFwiTmV0d29yayBEb21haW4gQmxhY2sgTGlzdCBEZXNjcmlwdGlvblwiKSlcclxuICAgICAgLmFkZFRleHRBcmVhKHRleHRBcmVhID0+XHJcbiAgICAgICAgdGV4dEFyZWFcclxuICAgICAgICAgIC5zZXRWYWx1ZSh0aGlzLnBsdWdpbi5zZXR0aW5ncy5uZXdXb3JrQmxhY2tEb21haW5zKVxyXG4gICAgICAgICAgLm9uQ2hhbmdlKGFzeW5jIHZhbHVlID0+IHtcclxuICAgICAgICAgICAgdGhpcy5wbHVnaW4uc2V0dGluZ3MubmV3V29ya0JsYWNrRG9tYWlucyA9IHZhbHVlO1xyXG4gICAgICAgICAgICBhd2FpdCB0aGlzLnBsdWdpbi5zYXZlU2V0dGluZ3MoKTtcclxuICAgICAgICAgIH0pXHJcbiAgICAgICk7XHJcblxyXG4gICAgbmV3IFNldHRpbmcoY29udGFpbmVyRWwpXHJcbiAgICAgIC5zZXROYW1lKHQoXCJVcGxvYWQgd2hlbiBjbGlwYm9hcmQgaGFzIGltYWdlIGFuZCB0ZXh0IHRvZ2V0aGVyXCIpKVxyXG4gICAgICAuc2V0RGVzYyhcclxuICAgICAgICB0KFxyXG4gICAgICAgICAgXCJXaGVuIHlvdSBjb3B5LCBzb21lIGFwcGxpY2F0aW9uIGxpa2UgRXhjZWwgd2lsbCBpbWFnZSBhbmQgdGV4dCB0byBjbGlwYm9hcmQsIHlvdSBjYW4gdXBsb2FkIG9yIG5vdC5cIlxyXG4gICAgICAgIClcclxuICAgICAgKVxyXG4gICAgICAuYWRkVG9nZ2xlKHRvZ2dsZSA9PlxyXG4gICAgICAgIHRvZ2dsZVxyXG4gICAgICAgICAgLnNldFZhbHVlKHRoaXMucGx1Z2luLnNldHRpbmdzLmFwcGx5SW1hZ2UpXHJcbiAgICAgICAgICAub25DaGFuZ2UoYXN5bmMgdmFsdWUgPT4ge1xyXG4gICAgICAgICAgICB0aGlzLnBsdWdpbi5zZXR0aW5ncy5hcHBseUltYWdlID0gdmFsdWU7XHJcbiAgICAgICAgICAgIHRoaXMuZGlzcGxheSgpO1xyXG4gICAgICAgICAgICBhd2FpdCB0aGlzLnBsdWdpbi5zYXZlU2V0dGluZ3MoKTtcclxuICAgICAgICAgIH0pXHJcbiAgICAgICk7XHJcblxyXG4gICAgbmV3IFNldHRpbmcoY29udGFpbmVyRWwpXHJcbiAgICAgIC5zZXROYW1lKHQoXCJEZWxldGUgc291cmNlIGZpbGUgYWZ0ZXIgeW91IHVwbG9hZCBmaWxlXCIpKVxyXG4gICAgICAuc2V0RGVzYyh0KFwiRGVsZXRlIHNvdXJjZSBmaWxlIGluIG9iIGFzc2V0cyBhZnRlciB5b3UgdXBsb2FkIGZpbGUuXCIpKVxyXG4gICAgICAuYWRkVG9nZ2xlKHRvZ2dsZSA9PlxyXG4gICAgICAgIHRvZ2dsZVxyXG4gICAgICAgICAgLnNldFZhbHVlKHRoaXMucGx1Z2luLnNldHRpbmdzLmRlbGV0ZVNvdXJjZSlcclxuICAgICAgICAgIC5vbkNoYW5nZShhc3luYyB2YWx1ZSA9PiB7XHJcbiAgICAgICAgICAgIHRoaXMucGx1Z2luLnNldHRpbmdzLmRlbGV0ZVNvdXJjZSA9IHZhbHVlO1xyXG4gICAgICAgICAgICB0aGlzLmRpc3BsYXkoKTtcclxuICAgICAgICAgICAgYXdhaXQgdGhpcy5wbHVnaW4uc2F2ZVNldHRpbmdzKCk7XHJcbiAgICAgICAgICB9KVxyXG4gICAgICApO1xyXG5cclxuICAgIG5ldyBTZXR0aW5nKGNvbnRhaW5lckVsKVxyXG4gICAgICAuc2V0TmFtZSgn5ZCv55SoIFBhbmRvYyBGaWcg5qC85byPJylcclxuICAgICAgLnNldERlc2MoJ+W8gOWQr+WQju+8jOS4iuS8oOWbvueJh+WwhueUn+aIkCAhW0FsdF0oVXJsKXsjZmlnOuaXtumXtOaIs30g5qC85byPJylcclxuICAgICAgLmFkZFRvZ2dsZSgodG9nZ2xlKSA9PiB7XHJcbiAgICAgICAgdG9nZ2xlXHJcbiAgICAgICAgICAuc2V0VmFsdWUodGhpcy5wbHVnaW4uc2V0dGluZ3MuYWRkUGFuZG9jRmlnKVxyXG4gICAgICAgICAgLm9uQ2hhbmdlKGFzeW5jICh2YWx1ZSkgPT4ge1xyXG4gICAgICAgICAgICB0aGlzLnBsdWdpbi5zZXR0aW5ncy5hZGRQYW5kb2NGaWcgPSB2YWx1ZTtcclxuICAgICAgICAgICAgYXdhaXQgdGhpcy5wbHVnaW4uc2F2ZVNldHRpbmdzKCk7XHJcbiAgICAgICAgICB9KTtcclxuICAgICAgfSk7XHJcblxyXG4gICAgbmV3IFNldHRpbmcoY29udGFpbmVyRWwpXHJcbiAgICAgIC5zZXROYW1lKFwi5Zu+54mH5YmN5ZCO5re75Yqg56m66KGMXCIpXHJcbiAgICAgIC5zZXREZXNjKFwi5byA5ZCv5ZCO77yM55Sf5oiQ55qE5Zu+5bqK6ZO+5o6l5YmN5ZCO5Lya6Ieq5Yqo5YyF6KO55Lik5Liq5o2i6KGM56ymXCIpXHJcbiAgICAgIC5hZGRUb2dnbGUoKHRvZ2dsZSkgPT5cclxuICAgICAgICB0b2dnbGVcclxuICAgICAgICAgIC5zZXRWYWx1ZSh0aGlzLnBsdWdpbi5zZXR0aW5ncy5hZGROZXdMaW5lQXJvdW5kSW1hZ2UpXHJcbiAgICAgICAgICAub25DaGFuZ2UoYXN5bmMgKHZhbHVlKSA9PiB7XHJcbiAgICAgICAgICAgIHRoaXMucGx1Z2luLnNldHRpbmdzLmFkZE5ld0xpbmVBcm91bmRJbWFnZSA9IHZhbHVlO1xyXG4gICAgICAgICAgICBhd2FpdCB0aGlzLnBsdWdpbi5zYXZlU2V0dGluZ3MoKTtcclxuICAgICAgICAgIH0pXHJcbiAgICAgICk7XHJcblxyXG4gICAgLy8gLS0tIFvmlrDlop7vvJpQYW5kb2Mg5Zu+54mH5a695bqmXSAtLS1cclxuICAgIG5ldyBTZXR0aW5nKGNvbnRhaW5lckVsKVxyXG4gICAgICAuc2V0TmFtZShcIlBhbmRvYyDlm77niYflrr3luqZcIilcclxuICAgICAgLnNldERlc2MoXCLorr7nva4gUGFuZG9jIOWvvOWHuuaXtueahOWbvueJh+WuveW6pu+8jOS+i+WmgjogMTRjbSDmiJYgODAl44CC6ZyA6YWN5ZCIIFBhbmRvYyBGaWcg5qC85byP5L2/55So44CCXCIpXHJcbiAgICAgIC5hZGRUZXh0KCh0ZXh0KSA9PlxyXG4gICAgICAgIHRleHRcclxuICAgICAgICAgIC5zZXRQbGFjZWhvbGRlcihcIjE0Y21cIilcclxuICAgICAgICAgIC5zZXRWYWx1ZSh0aGlzLnBsdWdpbi5zZXR0aW5ncy5wYW5kb2NJbWFnZVdpZHRoKVxyXG4gICAgICAgICAgLm9uQ2hhbmdlKGFzeW5jICh2YWx1ZSkgPT4ge1xyXG4gICAgICAgICAgICB0aGlzLnBsdWdpbi5zZXR0aW5ncy5wYW5kb2NJbWFnZVdpZHRoID0gdmFsdWU7XHJcbiAgICAgICAgICAgIGF3YWl0IHRoaXMucGx1Z2luLnNhdmVTZXR0aW5ncygpO1xyXG4gICAgICAgICAgfSlcclxuICAgICAgKTtcclxuXHJcbiAgfVxyXG59XHJcbiIsImltcG9ydCB7XHJcbiAgTWFya2Rvd25WaWV3LFxyXG4gIFBsdWdpbixcclxuICBFZGl0b3IsXHJcbiAgTWVudSxcclxuICBNZW51SXRlbSxcclxuICBURmlsZSxcclxuICBub3JtYWxpemVQYXRoLFxyXG4gIE5vdGljZSxcclxuICBhZGRJY29uLFxyXG4gIE1hcmtkb3duRmlsZUluZm8sXHJcbn0gZnJvbSBcIm9ic2lkaWFuXCI7XHJcbmltcG9ydCB7IHJlc29sdmUsIGJhc2VuYW1lLCBkaXJuYW1lIH0gZnJvbSBcInBhdGgtYnJvd3NlcmlmeVwiO1xyXG5cclxuaW1wb3J0IHsgaXNBc3NldFR5cGVBbkltYWdlLCBhcnJheVRvT2JqZWN0IH0gZnJvbSBcIi4vdXRpbHNcIjtcclxuaW1wb3J0IHsgZG93bmxvYWRBbGxJbWFnZUZpbGVzIH0gZnJvbSBcIi4vZG93bmxvYWRcIjtcclxuaW1wb3J0IHsgVXBsb2FkZXJNYW5hZ2VyIH0gZnJvbSBcIi4vdXBsb2FkZXIvaW5kZXhcIjtcclxuaW1wb3J0IHsgUGljR29EZWxldGVyIH0gZnJvbSBcIi4vZGVsZXRlclwiO1xyXG5pbXBvcnQgSGVscGVyIGZyb20gXCIuL2hlbHBlclwiO1xyXG5pbXBvcnQgeyB0IH0gZnJvbSBcIi4vbGFuZy9oZWxwZXJzXCI7XHJcbmltcG9ydCB7IFNldHRpbmdUYWIsIFBsdWdpblNldHRpbmdzLCBERUZBVUxUX1NFVFRJTkdTIH0gZnJvbSBcIi4vc2V0dGluZ1wiO1xyXG5cclxuaW1wb3J0IHR5cGUgeyBJbWFnZSB9IGZyb20gXCIuL3R5cGVzXCI7XHJcblxyXG5leHBvcnQgZGVmYXVsdCBjbGFzcyBpbWFnZUF1dG9VcGxvYWRQbHVnaW4gZXh0ZW5kcyBQbHVnaW4ge1xyXG4gIHNldHRpbmdzOiBQbHVnaW5TZXR0aW5ncztcclxuICBoZWxwZXI6IEhlbHBlcjtcclxuICBlZGl0b3I6IEVkaXRvcjtcclxuICBwaWNHb0RlbGV0ZXI6IFBpY0dvRGVsZXRlcjtcclxuXHJcbiAgYXN5bmMgbG9hZFNldHRpbmdzKCkge1xyXG4gICAgdGhpcy5zZXR0aW5ncyA9IE9iamVjdC5hc3NpZ24oREVGQVVMVF9TRVRUSU5HUywgYXdhaXQgdGhpcy5sb2FkRGF0YSgpKTtcclxuICB9XHJcblxyXG4gIGFzeW5jIHNhdmVTZXR0aW5ncygpIHtcclxuICAgIGF3YWl0IHRoaXMuc2F2ZURhdGEodGhpcy5zZXR0aW5ncyk7XHJcbiAgfVxyXG5cclxuICBvbnVubG9hZCgpIHt9XHJcblxyXG4gIGFzeW5jIG9ubG9hZCgpIHtcclxuICAgIGF3YWl0IHRoaXMubG9hZFNldHRpbmdzKCk7XHJcblxyXG4gICAgdGhpcy5oZWxwZXIgPSBuZXcgSGVscGVyKHRoaXMuYXBwKTtcclxuICAgIHRoaXMucGljR29EZWxldGVyID0gbmV3IFBpY0dvRGVsZXRlcih0aGlzKTtcclxuXHJcbiAgICBhZGRJY29uKFxyXG4gICAgICBcInVwbG9hZFwiLFxyXG4gICAgICBgPHN2ZyB0PVwiMTYzNjYzMDc4MzQyOVwiIGNsYXNzPVwiaWNvblwiIHZpZXdCb3g9XCIwIDAgMTAwIDEwMFwiIHZlcnNpb249XCIxLjFcIiBwLWlkPVwiNDY0OVwiIHhtbG5zPVwiaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmdcIj5cclxuICAgICAgPHBhdGggZD1cIk0gNzEuNjM4IDM1LjMzNiBMIDc5LjQwOCAzNS4zMzYgQyA4My43IDM1LjMzNiA4Ny4xNzggMzguNjYyIDg3LjE3OCA0Mi43NjUgTCA4Ny4xNzggODQuODY0IEMgODcuMTc4IDg4Ljk2OSA4My43IDkyLjI5NSA3OS40MDggOTIuMjk1IEwgMTcuMjQ5IDkyLjI5NSBDIDEyLjk1NyA5Mi4yOTUgOS40NzkgODguOTY5IDkuNDc5IDg0Ljg2NCBMIDkuNDc5IDQyLjc2NSBDIDkuNDc5IDM4LjY2MiAxMi45NTcgMzUuMzM2IDE3LjI0OSAzNS4zMzYgTCAyNS4wMTkgMzUuMzM2IEwgMjUuMDE5IDQyLjc2NSBMIDE3LjI0OSA0Mi43NjUgTCAxNy4yNDkgODQuODY0IEwgNzkuNDA4IDg0Ljg2NCBMIDc5LjQwOCA0Mi43NjUgTCA3MS42MzggNDIuNzY1IEwgNzEuNjM4IDM1LjMzNiBaIE0gNDkuMDE0IDEwLjE3OSBMIDY3LjMyNiAyNy42ODggTCA2MS44MzUgMzIuOTQyIEwgNTIuODQ5IDI0LjM1MiBMIDUyLjg0OSA1OS43MzEgTCA0NS4wNzggNTkuNzMxIEwgNDUuMDc4IDI0LjQ1NSBMIDM2LjE5NCAzMi45NDcgTCAzMC43MDIgMjcuNjkyIEwgNDkuMDEyIDEwLjE4MSBaXCIgcC1pZD1cIjQ2NTBcIiBmaWxsPVwiIzhhOGE4YVwiPjwvcGF0aD5cclxuICAgIDwvc3ZnPmBcclxuICAgICk7XHJcblxyXG4gICAgdGhpcy5hZGRTZXR0aW5nVGFiKG5ldyBTZXR0aW5nVGFiKHRoaXMuYXBwLCB0aGlzKSk7XHJcblxyXG4gICAgdGhpcy5hZGRDb21tYW5kKHtcclxuICAgICAgaWQ6IFwiVXBsb2FkIGFsbCBpbWFnZXNcIixcclxuICAgICAgbmFtZTogXCJVcGxvYWQgYWxsIGltYWdlc1wiLFxyXG4gICAgICBjaGVja0NhbGxiYWNrOiAoY2hlY2tpbmc6IGJvb2xlYW4pID0+IHtcclxuICAgICAgICBsZXQgbGVhZiA9IHRoaXMuYXBwLndvcmtzcGFjZS5nZXRBY3RpdmVWaWV3T2ZUeXBlKE1hcmtkb3duVmlldyk7XHJcbiAgICAgICAgaWYgKGxlYWYpIHtcclxuICAgICAgICAgIGlmICghY2hlY2tpbmcpIHtcclxuICAgICAgICAgICAgdGhpcy51cGxvYWRBbGxGaWxlKCk7XHJcbiAgICAgICAgICB9XHJcbiAgICAgICAgICByZXR1cm4gdHJ1ZTtcclxuICAgICAgICB9XHJcbiAgICAgICAgcmV0dXJuIGZhbHNlO1xyXG4gICAgICB9LFxyXG4gICAgfSk7XHJcbiAgICB0aGlzLmFkZENvbW1hbmQoe1xyXG4gICAgICBpZDogXCJEb3dubG9hZCBhbGwgaW1hZ2VzXCIsXHJcbiAgICAgIG5hbWU6IFwiRG93bmxvYWQgYWxsIGltYWdlc1wiLFxyXG4gICAgICBjaGVja0NhbGxiYWNrOiAoY2hlY2tpbmc6IGJvb2xlYW4pID0+IHtcclxuICAgICAgICBsZXQgbGVhZiA9IHRoaXMuYXBwLndvcmtzcGFjZS5nZXRBY3RpdmVWaWV3T2ZUeXBlKE1hcmtkb3duVmlldyk7XHJcbiAgICAgICAgaWYgKGxlYWYpIHtcclxuICAgICAgICAgIGlmICghY2hlY2tpbmcpIHtcclxuICAgICAgICAgICAgZG93bmxvYWRBbGxJbWFnZUZpbGVzKHRoaXMpO1xyXG4gICAgICAgICAgfVxyXG4gICAgICAgICAgcmV0dXJuIHRydWU7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIHJldHVybiBmYWxzZTtcclxuICAgICAgfSxcclxuICAgIH0pO1xyXG4gICAgdGhpcy5zZXR1cFBhc3RlSGFuZGxlcigpO1xyXG4gICAgdGhpcy5yZWdpc3RlckZpbGVNZW51KCk7XHJcbiAgICB0aGlzLnJlZ2lzdGVyU2VsZWN0aW9uKCk7XHJcbiAgfVxyXG5cclxuICAvKipcclxuICAgKiDojrflj5blvZPliY3kvb/nlKjnmoTkuIrkvKDlmahcclxuICAgKi9cclxuICBnZXRVcGxvYWRlcigpIHtcclxuICAgIGNvbnN0IHVwbG9hZGVyID0gbmV3IFVwbG9hZGVyTWFuYWdlcih0aGlzLnNldHRpbmdzLnVwbG9hZGVyLCB0aGlzKTtcclxuXHJcbiAgICByZXR1cm4gdXBsb2FkZXI7XHJcbiAgfVxyXG5cclxuICAvKipcclxuICAgKiDkuIrkvKDlm77niYdcclxuICAgKi9cclxuICB1cGxvYWQoaW1hZ2VzOiBJbWFnZVtdIHwgc3RyaW5nW10pIHtcclxuICAgIGxldCB1cGxvYWRlciA9IHRoaXMuZ2V0VXBsb2FkZXIoKTtcclxuICAgIHJldHVybiB1cGxvYWRlci51cGxvYWQoaW1hZ2VzKTtcclxuICB9XHJcblxyXG4gIC8qKlxyXG4gICAqIOmAmui/h+WJqui0tOadv+S4iuS8oOWbvueJh1xyXG4gICAqL1xyXG4gIHVwbG9hZEJ5Q2xpcGJvYXJkKGZpbGVMaXN0PzogRmlsZUxpc3QpIHtcclxuICAgIGxldCB1cGxvYWRlciA9IHRoaXMuZ2V0VXBsb2FkZXIoKTtcclxuICAgIHJldHVybiB1cGxvYWRlci51cGxvYWRCeUNsaXBib2FyZChmaWxlTGlzdCk7XHJcbiAgfVxyXG5cclxuICByZWdpc3RlclNlbGVjdGlvbigpIHtcclxuICAgIHRoaXMucmVnaXN0ZXJFdmVudChcclxuICAgICAgdGhpcy5hcHAud29ya3NwYWNlLm9uKFxyXG4gICAgICAgIFwiZWRpdG9yLW1lbnVcIixcclxuICAgICAgICAobWVudTogTWVudSwgZWRpdG9yOiBFZGl0b3IsIGluZm86IE1hcmtkb3duVmlldyB8IE1hcmtkb3duRmlsZUluZm8pID0+IHtcclxuICAgICAgICAgIGlmICh0aGlzLmFwcC53b3Jrc3BhY2UuZ2V0TGVhdmVzT2ZUeXBlKFwibWFya2Rvd25cIikubGVuZ3RoID09PSAwKSB7XHJcbiAgICAgICAgICAgIHJldHVybjtcclxuICAgICAgICAgIH1cclxuICAgICAgICAgIGNvbnN0IHNlbGVjdGlvbiA9IGVkaXRvci5nZXRTZWxlY3Rpb24oKTtcclxuICAgICAgICAgIGlmIChzZWxlY3Rpb24pIHtcclxuICAgICAgICAgICAgY29uc3QgbWFya2Rvd25SZWdleCA9IC8hXFxbLipcXF1cXCgoLiopXFwpL2c7XHJcbiAgICAgICAgICAgIGNvbnN0IG1hcmtkb3duTWF0Y2ggPSBtYXJrZG93blJlZ2V4LmV4ZWMoc2VsZWN0aW9uKTtcclxuICAgICAgICAgICAgaWYgKG1hcmtkb3duTWF0Y2ggJiYgbWFya2Rvd25NYXRjaC5sZW5ndGggPiAxKSB7XHJcbiAgICAgICAgICAgICAgY29uc3QgbWFya2Rvd25VcmwgPSBtYXJrZG93bk1hdGNoWzFdO1xyXG4gICAgICAgICAgICAgIGlmIChcclxuICAgICAgICAgICAgICAgIHRoaXMuc2V0dGluZ3MudXBsb2FkZWRJbWFnZXMuZmluZChcclxuICAgICAgICAgICAgICAgICAgKGl0ZW06IHsgaW1nVXJsOiBzdHJpbmcgfSkgPT4gaXRlbS5pbWdVcmwgPT09IG1hcmtkb3duVXJsXHJcbiAgICAgICAgICAgICAgICApXHJcbiAgICAgICAgICAgICAgKSB7XHJcbiAgICAgICAgICAgICAgICB0aGlzLmFkZFJlbW92ZU1lbnUobWVudSwgbWFya2Rvd25VcmwsIGVkaXRvcik7XHJcbiAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgICApXHJcbiAgICApO1xyXG4gIH1cclxuXHJcbiAgYWRkUmVtb3ZlTWVudSA9IChtZW51OiBNZW51LCBpbWdQYXRoOiBzdHJpbmcsIGVkaXRvcjogRWRpdG9yKSA9PiB7XHJcbiAgICBtZW51LmFkZEl0ZW0oKGl0ZW06IE1lbnVJdGVtKSA9PlxyXG4gICAgICBpdGVtXHJcbiAgICAgICAgLnNldEljb24oXCJ0cmFzaC0yXCIpXHJcbiAgICAgICAgLnNldFRpdGxlKHQoXCJEZWxldGUgaW1hZ2UgdXNpbmcgUGljTGlzdFwiKSlcclxuICAgICAgICAub25DbGljayhhc3luYyAoKSA9PiB7XHJcbiAgICAgICAgICB0cnkge1xyXG4gICAgICAgICAgICBjb25zdCBzZWxlY3RlZEl0ZW0gPSB0aGlzLnNldHRpbmdzLnVwbG9hZGVkSW1hZ2VzLmZpbmQoXHJcbiAgICAgICAgICAgICAgKGl0ZW06IHsgaW1nVXJsOiBzdHJpbmcgfSkgPT4gaXRlbS5pbWdVcmwgPT09IGltZ1BhdGhcclxuICAgICAgICAgICAgKTtcclxuICAgICAgICAgICAgaWYgKHNlbGVjdGVkSXRlbSkge1xyXG4gICAgICAgICAgICAgIGNvbnN0IHJlcyA9IGF3YWl0IHRoaXMucGljR29EZWxldGVyLmRlbGV0ZUltYWdlKFtzZWxlY3RlZEl0ZW1dKTtcclxuICAgICAgICAgICAgICBpZiAocmVzLnN1Y2Nlc3MpIHtcclxuICAgICAgICAgICAgICAgIG5ldyBOb3RpY2UodChcIkRlbGV0ZSBzdWNjZXNzZnVsbHlcIikpO1xyXG4gICAgICAgICAgICAgICAgY29uc3Qgc2VsZWN0aW9uID0gZWRpdG9yLmdldFNlbGVjdGlvbigpO1xyXG4gICAgICAgICAgICAgICAgaWYgKHNlbGVjdGlvbikge1xyXG4gICAgICAgICAgICAgICAgICBlZGl0b3IucmVwbGFjZVNlbGVjdGlvbihcIlwiKTtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIHRoaXMuc2V0dGluZ3MudXBsb2FkZWRJbWFnZXMgPVxyXG4gICAgICAgICAgICAgICAgICB0aGlzLnNldHRpbmdzLnVwbG9hZGVkSW1hZ2VzLmZpbHRlcihcclxuICAgICAgICAgICAgICAgICAgICAoaXRlbTogeyBpbWdVcmw6IHN0cmluZyB9KSA9PiBpdGVtLmltZ1VybCAhPT0gaW1nUGF0aFxyXG4gICAgICAgICAgICAgICAgICApO1xyXG4gICAgICAgICAgICAgICAgdGhpcy5zYXZlU2V0dGluZ3MoKTtcclxuICAgICAgICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICAgICAgbmV3IE5vdGljZSh0KFwiRGVsZXRlIGZhaWxlZFwiKSk7XHJcbiAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICB9IGNhdGNoIHtcclxuICAgICAgICAgICAgbmV3IE5vdGljZSh0KFwiRXJyb3IsIGNvdWxkIG5vdCBkZWxldGVcIikpO1xyXG4gICAgICAgICAgfVxyXG4gICAgICAgIH0pXHJcbiAgICApO1xyXG4gIH07XHJcblxyXG4gIHJlZ2lzdGVyRmlsZU1lbnUoKSB7XHJcbiAgICB0aGlzLnJlZ2lzdGVyRXZlbnQoXHJcbiAgICAgIHRoaXMuYXBwLndvcmtzcGFjZS5vbihcclxuICAgICAgICBcImZpbGUtbWVudVwiLFxyXG4gICAgICAgIChtZW51OiBNZW51LCBmaWxlOiBURmlsZSwgc291cmNlOiBzdHJpbmcsIGxlYWYpID0+IHtcclxuICAgICAgICAgIGlmIChzb3VyY2UgPT09IFwiY2FudmFzLW1lbnVcIikgcmV0dXJuIGZhbHNlO1xyXG4gICAgICAgICAgaWYgKCFpc0Fzc2V0VHlwZUFuSW1hZ2UoZmlsZS5wYXRoKSkgcmV0dXJuIGZhbHNlO1xyXG5cclxuICAgICAgICAgIG1lbnUuYWRkSXRlbSgoaXRlbTogTWVudUl0ZW0pID0+IHtcclxuICAgICAgICAgICAgaXRlbVxyXG4gICAgICAgICAgICAgIC5zZXRUaXRsZSh0KFwidXBsb2FkXCIpKVxyXG4gICAgICAgICAgICAgIC5zZXRJY29uKFwidXBsb2FkXCIpXHJcbiAgICAgICAgICAgICAgLm9uQ2xpY2soKCkgPT4ge1xyXG4gICAgICAgICAgICAgICAgaWYgKCEoZmlsZSBpbnN0YW5jZW9mIFRGaWxlKSkge1xyXG4gICAgICAgICAgICAgICAgICByZXR1cm4gZmFsc2U7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICB0aGlzLmZpbGVNZW51VXBsb2FkKGZpbGUpO1xyXG4gICAgICAgICAgICAgIH0pO1xyXG4gICAgICAgICAgfSk7XHJcbiAgICAgICAgfVxyXG4gICAgICApXHJcbiAgICApO1xyXG4gIH1cclxuXHJcbiAgZmlsZU1lbnVVcGxvYWQoZmlsZTogVEZpbGUpIHtcclxuICAgIGxldCBpbWFnZUxpc3Q6IEltYWdlW10gPSBbXTtcclxuICAgIGNvbnN0IGZpbGVBcnJheSA9IHRoaXMuaGVscGVyLmdldEFsbEZpbGVzKCk7XHJcblxyXG4gICAgZm9yIChjb25zdCBtYXRjaCBvZiBmaWxlQXJyYXkpIHtcclxuICAgICAgY29uc3QgaW1hZ2VOYW1lID0gbWF0Y2gubmFtZTtcclxuICAgICAgY29uc3QgZW5jb2RlZFVyaSA9IG1hdGNoLnBhdGg7XHJcblxyXG4gICAgICBjb25zdCBmaWxlTmFtZSA9IGJhc2VuYW1lKGRlY29kZVVSSShlbmNvZGVkVXJpKSk7XHJcblxyXG4gICAgICBpZiAoZmlsZSAmJiBmaWxlLm5hbWUgPT09IGZpbGVOYW1lKSB7XHJcbiAgICAgICAgaWYgKGlzQXNzZXRUeXBlQW5JbWFnZShmaWxlLnBhdGgpKSB7XHJcbiAgICAgICAgICBpbWFnZUxpc3QucHVzaCh7XHJcbiAgICAgICAgICAgIHBhdGg6IGZpbGUucGF0aCxcclxuICAgICAgICAgICAgbmFtZTogaW1hZ2VOYW1lLFxyXG4gICAgICAgICAgICBzb3VyY2U6IG1hdGNoLnNvdXJjZSxcclxuICAgICAgICAgICAgZmlsZTogZmlsZSxcclxuICAgICAgICAgIH0pO1xyXG4gICAgICAgIH1cclxuICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIGlmIChpbWFnZUxpc3QubGVuZ3RoID09PSAwKSB7XHJcbiAgICAgIG5ldyBOb3RpY2UodChcIkNhbiBub3QgZmluZCBpbWFnZSBmaWxlXCIpKTtcclxuICAgICAgcmV0dXJuO1xyXG4gICAgfVxyXG5cclxuICAgIHRoaXMudXBsb2FkKGltYWdlTGlzdCkudGhlbihyZXMgPT4ge1xyXG4gICAgICBpZiAoIXJlcy5zdWNjZXNzKSB7XHJcbiAgICAgICAgbmV3IE5vdGljZShcIlVwbG9hZCBlcnJvclwiKTtcclxuICAgICAgICByZXR1cm47XHJcbiAgICAgIH1cclxuXHJcbiAgICAgIGxldCB1cGxvYWRVcmxMaXN0ID0gcmVzLnJlc3VsdDtcclxuICAgICAgdGhpcy5yZXBsYWNlSW1hZ2UoaW1hZ2VMaXN0LCB1cGxvYWRVcmxMaXN0KTtcclxuICAgIH0pO1xyXG4gIH1cclxuXHJcbiAgZmlsdGVyRmlsZShmaWxlQXJyYXk6IEltYWdlW10pIHtcclxuICAgIGNvbnN0IGltYWdlTGlzdDogSW1hZ2VbXSA9IFtdO1xyXG5cclxuICAgIGZvciAoY29uc3QgbWF0Y2ggb2YgZmlsZUFycmF5KSB7XHJcbiAgICAgIGlmIChtYXRjaC5wYXRoLnN0YXJ0c1dpdGgoXCJodHRwXCIpKSB7XHJcbiAgICAgICAgaWYgKHRoaXMuc2V0dGluZ3Mud29ya09uTmV0V29yaykge1xyXG4gICAgICAgICAgaWYgKFxyXG4gICAgICAgICAgICAhdGhpcy5oZWxwZXIuaGFzQmxhY2tEb21haW4oXHJcbiAgICAgICAgICAgICAgbWF0Y2gucGF0aCxcclxuICAgICAgICAgICAgICB0aGlzLnNldHRpbmdzLm5ld1dvcmtCbGFja0RvbWFpbnNcclxuICAgICAgICAgICAgKVxyXG4gICAgICAgICAgKSB7XHJcbiAgICAgICAgICAgIGltYWdlTGlzdC5wdXNoKHtcclxuICAgICAgICAgICAgICBwYXRoOiBtYXRjaC5wYXRoLFxyXG4gICAgICAgICAgICAgIG5hbWU6IG1hdGNoLm5hbWUsXHJcbiAgICAgICAgICAgICAgc291cmNlOiBtYXRjaC5zb3VyY2UsXHJcbiAgICAgICAgICAgIH0pO1xyXG4gICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgICAgfSBlbHNlIHtcclxuICAgICAgICBpbWFnZUxpc3QucHVzaCh7XHJcbiAgICAgICAgICBwYXRoOiBtYXRjaC5wYXRoLFxyXG4gICAgICAgICAgbmFtZTogbWF0Y2gubmFtZSxcclxuICAgICAgICAgIHNvdXJjZTogbWF0Y2guc291cmNlLFxyXG4gICAgICAgIH0pO1xyXG4gICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgcmV0dXJuIGltYWdlTGlzdDtcclxuICB9XHJcblxyXG4gIC8qKlxyXG4gICAqIOabv+aNouS4iuS8oOeahOWbvueJh1xyXG4gICAqL1xyXG4gIHJlcGxhY2VJbWFnZShpbWFnZUxpc3Q6IEltYWdlW10sIHVwbG9hZFVybExpc3Q6IHN0cmluZ1tdKSB7XHJcbiAgICBsZXQgY29udGVudCA9IHRoaXMuaGVscGVyLmdldFZhbHVlKCk7XHJcblxyXG4gICAgLy8gLS0tIOOAkOS/ruaUueW8gOWni++8muWinuWKoCBpbmRleCDlj4LmlbDjgJEgLS0tXHJcbiAgICBpbWFnZUxpc3QubWFwKChpdGVtLCBpbmRleCkgPT4ge1xyXG4gICAgICBjb25zdCB1cGxvYWRJbWFnZSA9IHVwbG9hZFVybExpc3Quc2hpZnQoKTtcclxuXHJcbiAgICAgIGxldCBuYW1lID0gdGhpcy5oYW5kbGVOYW1lKGl0ZW0ubmFtZSk7XHJcblxyXG4gICAgICBsZXQgcmVwbGFjZW1lbnQgPSBcIlwiO1xyXG4gICAgICBpZiAodGhpcy5zZXR0aW5ncy5hZGRQYW5kb2NGaWcpIHtcclxuICAgICAgICAvLyDoh6rliqjnlJ/miJDml7bpl7TmiLMgSURcclxuICAgICAgICBjb25zdCB0aW1lc3RhbXAgPSAod2luZG93IGFzIGFueSkubW9tZW50KCkuZm9ybWF0KFwiWVlZWU1NRERISG1tc3NcIikgKyAoaW5kZXggPiAwID8gYC0ke2luZGV4fWAgOiBcIlwiKTtcclxuICAgICAgICAvLyDjgJDlhbPplK7kv67mlLnjgJHvvJrku47orr7nva7or7vlj5blrr3luqblubbmlL7lhaUgeyNmaWc6Li4ufSDlhoXpg6hcclxuICAgICAgICBjb25zdCB3aWR0aCA9IHRoaXMuc2V0dGluZ3MucGFuZG9jSW1hZ2VXaWR0aCB8fCBcIjE0Y21cIjtcclxuICAgICAgICByZXBsYWNlbWVudCA9IGAhWyR7bmFtZX1dKCR7dXBsb2FkSW1hZ2V9KXsjZmlnOiR7dGltZXN0YW1wfSB3aWR0aD0ke3dpZHRofX1gO1xyXG4gICAgICB9IGVsc2Uge1xyXG4gICAgICAgIHJlcGxhY2VtZW50ID0gYCFbJHtuYW1lfV0oJHt1cGxvYWRJbWFnZX0pYDtcclxuICAgICAgfVxyXG5cclxuICAgICAgLy8g44CQ5YWz6ZSu5L+u5pS544CR77ya57uf5LiA5re75Yqg56m66KGM6YC76L6RXHJcbiAgICAgIGlmICh0aGlzLnNldHRpbmdzLmFkZE5ld0xpbmVBcm91bmRJbWFnZSkge1xyXG4gICAgICAgIHJlcGxhY2VtZW50ID0gYFxcblxcbiR7cmVwbGFjZW1lbnR9XFxuXFxuYDtcclxuICAgICAgfVxyXG5cclxuICAgICAgLy8g5rOo5oSP77ya6L+Z6YeM55SoIHJlcGxhY2VtZW50IOabv+aNouWOn+adpeeahOWbvueJh+mTvuaOpVxyXG4gICAgICBjb250ZW50ID0gY29udGVudC5yZXBsYWNlQWxsKGl0ZW0uc291cmNlLCByZXBsYWNlbWVudCk7XHJcbiAgICB9KTtcclxuICAgIC8vIC0tLSDjgJDkv67mlLnnu5PmnZ/jgJEgLS0tXHJcblxyXG4gICAgdGhpcy5oZWxwZXIuc2V0VmFsdWUoY29udGVudCk7XHJcblxyXG4gICAgaWYgKHRoaXMuc2V0dGluZ3MuZGVsZXRlU291cmNlKSB7XHJcbiAgICAgIGltYWdlTGlzdC5tYXAoaW1hZ2UgPT4ge1xyXG4gICAgICAgIGlmIChpbWFnZS5maWxlICYmICFpbWFnZS5wYXRoLnN0YXJ0c1dpdGgoXCJodHRwXCIpKSB7XHJcbiAgICAgICAgICB0aGlzLmFwcC5maWxlTWFuYWdlci50cmFzaEZpbGUoaW1hZ2UuZmlsZSk7XHJcbiAgICAgICAgfVxyXG4gICAgICB9KTtcclxuICAgIH1cclxuICB9XHJcblxyXG4gIC8qKlxyXG4gICAqIOS4iuS8oOaJgOacieWbvueJh1xyXG4gICAqL1xyXG4gIHVwbG9hZEFsbEZpbGUoKSB7XHJcbiAgICBjb25zdCBhY3RpdmVGaWxlID0gdGhpcy5hcHAud29ya3NwYWNlLmdldEFjdGl2ZUZpbGUoKTtcclxuICAgIGNvbnN0IGZpbGVNYXAgPSBhcnJheVRvT2JqZWN0KHRoaXMuYXBwLnZhdWx0LmdldEZpbGVzKCksIFwibmFtZVwiKTtcclxuICAgIGNvbnN0IGZpbGVQYXRoTWFwID0gYXJyYXlUb09iamVjdCh0aGlzLmFwcC52YXVsdC5nZXRGaWxlcygpLCBcInBhdGhcIik7XHJcbiAgICBsZXQgaW1hZ2VMaXN0OiAoSW1hZ2UgJiB7IGZpbGU6IFRGaWxlIHwgbnVsbCB9KVtdID0gW107XHJcbiAgICBjb25zdCBmaWxlQXJyYXkgPSB0aGlzLmZpbHRlckZpbGUodGhpcy5oZWxwZXIuZ2V0QWxsRmlsZXMoKSk7XHJcblxyXG4gICAgZm9yIChjb25zdCBtYXRjaCBvZiBmaWxlQXJyYXkpIHtcclxuICAgICAgY29uc3QgaW1hZ2VOYW1lID0gbWF0Y2gubmFtZTtcclxuICAgICAgY29uc3QgdXJpID0gZGVjb2RlVVJJKG1hdGNoLnBhdGgpO1xyXG5cclxuICAgICAgaWYgKHVyaS5zdGFydHNXaXRoKFwiaHR0cFwiKSkge1xyXG4gICAgICAgIGltYWdlTGlzdC5wdXNoKHtcclxuICAgICAgICAgIHBhdGg6IG1hdGNoLnBhdGgsXHJcbiAgICAgICAgICBuYW1lOiBpbWFnZU5hbWUsXHJcbiAgICAgICAgICBzb3VyY2U6IG1hdGNoLnNvdXJjZSxcclxuICAgICAgICAgIGZpbGU6IG51bGwsXHJcbiAgICAgICAgfSk7XHJcbiAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgY29uc3QgZmlsZU5hbWUgPSBiYXNlbmFtZSh1cmkpO1xyXG4gICAgICAgIGxldCBmaWxlOiBURmlsZSB8IHVuZGVmaW5lZCB8IG51bGw7XHJcbiAgICAgICAgLy8g5LyY5YWI5Yy56YWN57ud5a+56Lev5b6EXHJcbiAgICAgICAgaWYgKGZpbGVQYXRoTWFwW3VyaV0pIHtcclxuICAgICAgICAgIGZpbGUgPSBmaWxlUGF0aE1hcFt1cmldO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgLy8g55u45a+56Lev5b6EXHJcbiAgICAgICAgaWYgKCghZmlsZSAmJiB1cmkuc3RhcnRzV2l0aChcIi4vXCIpKSB8fCB1cmkuc3RhcnRzV2l0aChcIi4uL1wiKSkge1xyXG4gICAgICAgICAgY29uc3QgZmlsZVBhdGggPSBub3JtYWxpemVQYXRoKFxyXG4gICAgICAgICAgICByZXNvbHZlKGRpcm5hbWUoYWN0aXZlRmlsZS5wYXRoKSwgdXJpKVxyXG4gICAgICAgICAgKTtcclxuXHJcbiAgICAgICAgICBmaWxlID0gZmlsZVBhdGhNYXBbZmlsZVBhdGhdO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgLy8g5bC95Y+v6IO955+t6Lev5b6EXHJcbiAgICAgICAgaWYgKCFmaWxlKSB7XHJcbiAgICAgICAgICBmaWxlID0gZmlsZU1hcFtmaWxlTmFtZV07XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICBpZiAoZmlsZSkge1xyXG4gICAgICAgICAgaWYgKGlzQXNzZXRUeXBlQW5JbWFnZShmaWxlLnBhdGgpKSB7XHJcbiAgICAgICAgICAgIGltYWdlTGlzdC5wdXNoKHtcclxuICAgICAgICAgICAgICBwYXRoOiBub3JtYWxpemVQYXRoKGZpbGUucGF0aCksXHJcbiAgICAgICAgICAgICAgbmFtZTogaW1hZ2VOYW1lLFxyXG4gICAgICAgICAgICAgIHNvdXJjZTogbWF0Y2guc291cmNlLFxyXG4gICAgICAgICAgICAgIGZpbGU6IGZpbGUsXHJcbiAgICAgICAgICAgIH0pO1xyXG4gICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIGlmIChpbWFnZUxpc3QubGVuZ3RoID09PSAwKSB7XHJcbiAgICAgIG5ldyBOb3RpY2UodChcIkNhbiBub3QgZmluZCBpbWFnZSBmaWxlXCIpKTtcclxuICAgICAgcmV0dXJuO1xyXG4gICAgfSBlbHNlIHtcclxuICAgICAgbmV3IE5vdGljZShgSGF2ZSBmb3VuZCAke2ltYWdlTGlzdC5sZW5ndGh9IGltYWdlc2ApO1xyXG4gICAgfVxyXG5cclxuICAgIHRoaXMudXBsb2FkKGltYWdlTGlzdCkudGhlbihyZXMgPT4ge1xyXG4gICAgICBsZXQgdXBsb2FkVXJsTGlzdCA9IHJlcy5yZXN1bHQ7XHJcbiAgICAgIGlmIChpbWFnZUxpc3QubGVuZ3RoICE9PSB1cGxvYWRVcmxMaXN0Lmxlbmd0aCkge1xyXG4gICAgICAgIG5ldyBOb3RpY2UoXHJcbiAgICAgICAgICB0KFwiV2FybmluZzogdXBsb2FkIGZpbGVzIGlzIGRpZmZlcmVudCBvZiByZWNpdmVyIGZpbGVzIGZyb20gYXBpXCIpXHJcbiAgICAgICAgKTtcclxuICAgICAgICByZXR1cm47XHJcbiAgICAgIH1cclxuICAgICAgY29uc3QgY3VycmVudEZpbGUgPSB0aGlzLmFwcC53b3Jrc3BhY2UuZ2V0QWN0aXZlRmlsZSgpO1xyXG4gICAgICBpZiAoYWN0aXZlRmlsZS5wYXRoICE9PSBjdXJyZW50RmlsZS5wYXRoKSB7XHJcbiAgICAgICAgbmV3IE5vdGljZSh0KFwiRmlsZSBoYXMgYmVlbiBjaGFuZ2VkZCwgdXBsb2FkIGZhaWx1cmVcIikpO1xyXG4gICAgICAgIHJldHVybjtcclxuICAgICAgfVxyXG5cclxuICAgICAgdGhpcy5yZXBsYWNlSW1hZ2UoaW1hZ2VMaXN0LCB1cGxvYWRVcmxMaXN0KTtcclxuICAgIH0pO1xyXG4gIH1cclxuXHJcbiAgc2V0dXBQYXN0ZUhhbmRsZXIoKSB7XHJcbiAgICB0aGlzLnJlZ2lzdGVyRXZlbnQoXHJcbiAgICAgIHRoaXMuYXBwLndvcmtzcGFjZS5vbihcclxuICAgICAgICBcImVkaXRvci1wYXN0ZVwiLFxyXG4gICAgICAgIChldnQ6IENsaXBib2FyZEV2ZW50LCBlZGl0b3I6IEVkaXRvciwgbWFya2Rvd25WaWV3OiBNYXJrZG93blZpZXcpID0+IHtcclxuICAgICAgICAgIGNvbnN0IGFsbG93VXBsb2FkID0gdGhpcy5oZWxwZXIuZ2V0RnJvbnRtYXR0ZXJWYWx1ZShcclxuICAgICAgICAgICAgXCJpbWFnZS1hdXRvLXVwbG9hZFwiLFxyXG4gICAgICAgICAgICB0aGlzLnNldHRpbmdzLnVwbG9hZEJ5Q2xpcFN3aXRjaFxyXG4gICAgICAgICAgKTtcclxuXHJcbiAgICAgICAgICBsZXQgZmlsZXMgPSBldnQuY2xpcGJvYXJkRGF0YS5maWxlcztcclxuICAgICAgICAgIGlmICghYWxsb3dVcGxvYWQpIHtcclxuICAgICAgICAgICAgcmV0dXJuO1xyXG4gICAgICAgICAgfVxyXG5cclxuICAgICAgICAgIC8vIOWJqui0tOadv+WGheWuueaciW1k5qC85byP55qE5Zu+54mH5pe2XHJcbiAgICAgICAgICBpZiAodGhpcy5zZXR0aW5ncy53b3JrT25OZXRXb3JrKSB7XHJcbiAgICAgICAgICAgIGNvbnN0IGNsaXBib2FyZFZhbHVlID0gZXZ0LmNsaXBib2FyZERhdGEuZ2V0RGF0YShcInRleHQvcGxhaW5cIik7XHJcbiAgICAgICAgICAgIGNvbnN0IGltYWdlTGlzdCA9IHRoaXMuaGVscGVyXHJcbiAgICAgICAgICAgICAgLmdldEltYWdlTGluayhjbGlwYm9hcmRWYWx1ZSlcclxuICAgICAgICAgICAgICAuZmlsdGVyKGltYWdlID0+IGltYWdlLnBhdGguc3RhcnRzV2l0aChcImh0dHBcIikpXHJcbiAgICAgICAgICAgICAgLmZpbHRlcihcclxuICAgICAgICAgICAgICAgIGltYWdlID0+XHJcbiAgICAgICAgICAgICAgICAgICF0aGlzLmhlbHBlci5oYXNCbGFja0RvbWFpbihcclxuICAgICAgICAgICAgICAgICAgICBpbWFnZS5wYXRoLFxyXG4gICAgICAgICAgICAgICAgICAgIHRoaXMuc2V0dGluZ3MubmV3V29ya0JsYWNrRG9tYWluc1xyXG4gICAgICAgICAgICAgICAgICApXHJcbiAgICAgICAgICAgICAgKTtcclxuXHJcbiAgICAgICAgICAgIGlmIChpbWFnZUxpc3QubGVuZ3RoICE9PSAwKSB7XHJcbiAgICAgICAgICAgICAgdGhpcy51cGxvYWQoaW1hZ2VMaXN0KS50aGVuKHJlcyA9PiB7XHJcbiAgICAgICAgICAgICAgICBsZXQgdXBsb2FkVXJsTGlzdCA9IHJlcy5yZXN1bHQ7XHJcbiAgICAgICAgICAgICAgICB0aGlzLnJlcGxhY2VJbWFnZShpbWFnZUxpc3QsIHVwbG9hZFVybExpc3QpO1xyXG4gICAgICAgICAgICAgIH0pO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgLy8g5Ymq6LS05p2/5Lit5piv5Zu+54mH5pe26L+b6KGM5LiK5LygXHJcbiAgICAgICAgICBpZiAodGhpcy5jYW5VcGxvYWQoZXZ0LmNsaXBib2FyZERhdGEpKSB7XHJcbiAgICAgICAgICAgIHRoaXMudXBsb2FkRmlsZUFuZEVtYmVkSW1ndXJJbWFnZShcclxuICAgICAgICAgICAgICBlZGl0b3IsXHJcbiAgICAgICAgICAgICAgYXN5bmMgKGVkaXRvcjogRWRpdG9yLCBwYXN0ZUlkOiBzdHJpbmcpID0+IHtcclxuICAgICAgICAgICAgICAgIGxldCByZXM6IGFueTtcclxuICAgICAgICAgICAgICAgIHJlcyA9IGF3YWl0IHRoaXMudXBsb2FkQnlDbGlwYm9hcmQoZXZ0LmNsaXBib2FyZERhdGEuZmlsZXMpO1xyXG5cclxuICAgICAgICAgICAgICAgIGlmIChyZXMuc3VjY2Vzcykge1xyXG4gICAgICAgICAgICAgICAgICAvLyBQaWNHbyDov5Tlm57nmoTmmK8gcmVzdWx0IOaVsOe7hO+8jOWPluesrOS4gOS4quS9nOS4uiBVUkxcclxuICAgICAgICAgICAgICAgICAgcmV0dXJuIHJlcy5yZXN1bHQgPyByZXMucmVzdWx0WzBdIDogcmVzLmRhdGE7XHJcbiAgICAgICAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgICAgICAgLy8g5aaC5p6c5rKh5pyJIHN1Y2Nlc3Mg5a2X5q6177yM5YaN5Zue6YCA5Y675Yik5patIGNvZGUgKOWFvOWuueaXp+mAu+i+kSlcclxuICAgICAgICAgICAgICAgIGlmIChyZXMuY29kZSAhPT0gdW5kZWZpbmVkICYmIHJlcy5jb2RlICE9PSAwKSB7XHJcbiAgICAgICAgICAgICAgICAgIHRoaXMuaGFuZGxlRmFpbGVkVXBsb2FkKGVkaXRvciwgcGFzdGVJZCwgcmVzLm1zZyk7XHJcbiAgICAgICAgICAgICAgICAgIHJldHVybjtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIGNvbnN0IHVybCA9IHJlcy5kYXRhO1xyXG5cclxuICAgICAgICAgICAgICAgIHJldHVybiB1cmw7XHJcbiAgICAgICAgICAgICAgfSxcclxuICAgICAgICAgICAgICBldnQuY2xpcGJvYXJkRGF0YVxyXG4gICAgICAgICAgICApLmNhdGNoKCk7XHJcbiAgICAgICAgICAgIGV2dC5wcmV2ZW50RGVmYXVsdCgpO1xyXG4gICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgICAgKVxyXG4gICAgKTtcclxuICAgIHRoaXMucmVnaXN0ZXJFdmVudChcclxuICAgICAgdGhpcy5hcHAud29ya3NwYWNlLm9uKFxyXG4gICAgICAgIFwiZWRpdG9yLWRyb3BcIixcclxuICAgICAgICBhc3luYyAoZXZ0OiBEcmFnRXZlbnQsIGVkaXRvcjogRWRpdG9yLCBtYXJrZG93blZpZXc6IE1hcmtkb3duVmlldykgPT4ge1xyXG4gICAgICAgICAgLy8gd2hlbiBjdHJsIGtleSBpcyBwcmVzc2VkLCBkbyBub3QgdXBsb2FkIGltYWdlLCBiZWNhdXNlIGl0IGlzIHVzZWQgdG8gc2V0IGxvY2FsIGZpbGVcclxuICAgICAgICAgIGlmIChldnQuY3RybEtleSkge1xyXG4gICAgICAgICAgICByZXR1cm47XHJcbiAgICAgICAgICB9XHJcbiAgICAgICAgICBjb25zdCBhbGxvd1VwbG9hZCA9IHRoaXMuaGVscGVyLmdldEZyb250bWF0dGVyVmFsdWUoXHJcbiAgICAgICAgICAgIFwiaW1hZ2UtYXV0by11cGxvYWRcIixcclxuICAgICAgICAgICAgdGhpcy5zZXR0aW5ncy51cGxvYWRCeUNsaXBTd2l0Y2hcclxuICAgICAgICAgICk7XHJcblxyXG4gICAgICAgICAgaWYgKCFhbGxvd1VwbG9hZCkge1xyXG4gICAgICAgICAgICByZXR1cm47XHJcbiAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgbGV0IGZpbGVzID0gZXZ0LmRhdGFUcmFuc2Zlci5maWxlcztcclxuICAgICAgICAgIGlmIChmaWxlcy5sZW5ndGggIT09IDAgJiYgZmlsZXNbMF0udHlwZS5zdGFydHNXaXRoKFwiaW1hZ2VcIikpIHtcclxuICAgICAgICAgICAgbGV0IHNlbmRGaWxlczogQXJyYXk8c3RyaW5nPiA9IFtdO1xyXG4gICAgICAgICAgICBsZXQgZmlsZXMgPSBldnQuZGF0YVRyYW5zZmVyLmZpbGVzO1xyXG4gICAgICAgICAgICBBcnJheS5mcm9tKGZpbGVzKS5mb3JFYWNoKChpdGVtLCBpbmRleCkgPT4ge1xyXG4gICAgICAgICAgICAgIGlmIChpdGVtLnBhdGgpIHtcclxuICAgICAgICAgICAgICAgIHNlbmRGaWxlcy5wdXNoKGl0ZW0ucGF0aCk7XHJcbiAgICAgICAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgICAgIGNvbnN0IHsgd2ViVXRpbHMgfSA9IHJlcXVpcmUoXCJlbGVjdHJvblwiKTtcclxuICAgICAgICAgICAgICAgIGNvbnN0IHBhdGggPSB3ZWJVdGlscy5nZXRQYXRoRm9yRmlsZShpdGVtKTtcclxuICAgICAgICAgICAgICAgIHNlbmRGaWxlcy5wdXNoKHBhdGgpO1xyXG4gICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgICAgIGV2dC5wcmV2ZW50RGVmYXVsdCgpO1xyXG5cclxuICAgICAgICAgICAgY29uc3QgZGF0YSA9IGF3YWl0IHRoaXMudXBsb2FkKHNlbmRGaWxlcyk7XHJcblxyXG4gICAgICAgICAgICBpZiAoZGF0YS5zdWNjZXNzKSB7XHJcbiAgICAgICAgICAgICAgZGF0YS5yZXN1bHQubWFwKCh2YWx1ZTogc3RyaW5nKSA9PiB7XHJcbiAgICAgICAgICAgICAgICBsZXQgcGFzdGVJZCA9IChNYXRoLnJhbmRvbSgpICsgMSkudG9TdHJpbmcoMzYpLnN1YnN0cigyLCA1KTtcclxuICAgICAgICAgICAgICAgIHRoaXMuaW5zZXJ0VGVtcG9yYXJ5VGV4dChlZGl0b3IsIHBhc3RlSWQpO1xyXG4gICAgICAgICAgICAgICAgdGhpcy5lbWJlZE1hcmtEb3duSW1hZ2UoZWRpdG9yLCBwYXN0ZUlkLCB2YWx1ZSwgZmlsZXNbMF0ubmFtZSk7XHJcbiAgICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgICAgbmV3IE5vdGljZShcIlVwbG9hZCBlcnJvclwiKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgICAgKVxyXG4gICAgKTtcclxuICB9XHJcblxyXG4gIGNhblVwbG9hZChjbGlwYm9hcmREYXRhOiBEYXRhVHJhbnNmZXIpIHtcclxuICAgIHRoaXMuc2V0dGluZ3MuYXBwbHlJbWFnZTtcclxuICAgIGNvbnN0IGZpbGVzID0gY2xpcGJvYXJkRGF0YS5maWxlcztcclxuICAgIGNvbnN0IHRleHQgPSBjbGlwYm9hcmREYXRhLmdldERhdGEoXCJ0ZXh0XCIpO1xyXG5cclxuICAgIGNvbnN0IGhhc0ltYWdlRmlsZSA9XHJcbiAgICAgIGZpbGVzLmxlbmd0aCAhPT0gMCAmJiBmaWxlc1swXS50eXBlLnN0YXJ0c1dpdGgoXCJpbWFnZVwiKTtcclxuICAgIGlmIChoYXNJbWFnZUZpbGUpIHtcclxuICAgICAgaWYgKCEhdGV4dCkge1xyXG4gICAgICAgIHJldHVybiB0aGlzLnNldHRpbmdzLmFwcGx5SW1hZ2U7XHJcbiAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgcmV0dXJuIHRydWU7XHJcbiAgICAgIH1cclxuICAgIH0gZWxzZSB7XHJcbiAgICAgIHJldHVybiBmYWxzZTtcclxuICAgIH1cclxuICB9XHJcblxyXG4gIGFzeW5jIHVwbG9hZEZpbGVBbmRFbWJlZEltZ3VySW1hZ2UoXHJcbiAgICBlZGl0b3I6IEVkaXRvcixcclxuICAgIGNhbGxiYWNrOiBGdW5jdGlvbixcclxuICAgIGNsaXBib2FyZERhdGE6IERhdGFUcmFuc2ZlclxyXG4gICkge1xyXG4gICAgbGV0IHBhc3RlSWQgPSAoTWF0aC5yYW5kb20oKSArIDEpLnRvU3RyaW5nKDM2KS5zdWJzdHIoMiwgNSk7XHJcbiAgICB0aGlzLmluc2VydFRlbXBvcmFyeVRleHQoZWRpdG9yLCBwYXN0ZUlkKTtcclxuICAgIGNvbnN0IG5hbWUgPSBjbGlwYm9hcmREYXRhLmZpbGVzWzBdLm5hbWU7XHJcblxyXG4gICAgdHJ5IHtcclxuICAgICAgY29uc3QgdXJsID0gYXdhaXQgY2FsbGJhY2soZWRpdG9yLCBwYXN0ZUlkKTtcclxuICAgICAgdGhpcy5lbWJlZE1hcmtEb3duSW1hZ2UoZWRpdG9yLCBwYXN0ZUlkLCB1cmwsIG5hbWUpO1xyXG4gICAgfSBjYXRjaCAoZSkge1xyXG4gICAgICB0aGlzLmhhbmRsZUZhaWxlZFVwbG9hZChlZGl0b3IsIHBhc3RlSWQsIGUpO1xyXG4gICAgfVxyXG4gIH1cclxuXHJcbiAgaW5zZXJ0VGVtcG9yYXJ5VGV4dChlZGl0b3I6IEVkaXRvciwgcGFzdGVJZDogc3RyaW5nKSB7XHJcbiAgICBsZXQgcHJvZ3Jlc3NUZXh0ID0gaW1hZ2VBdXRvVXBsb2FkUGx1Z2luLnByb2dyZXNzVGV4dEZvcihwYXN0ZUlkKTtcclxuICAgIGVkaXRvci5yZXBsYWNlU2VsZWN0aW9uKHByb2dyZXNzVGV4dCk7XHJcbiAgfVxyXG5cclxuICBwcml2YXRlIHN0YXRpYyBwcm9ncmVzc1RleHRGb3IoaWQ6IHN0cmluZykge1xyXG4gICAgcmV0dXJuIGAhW1VwbG9hZGluZyBmaWxlLi4uJHtpZH1dKClgO1xyXG4gIH1cclxuXHJcbiAgZW1iZWRNYXJrRG93bkltYWdlKFxyXG4gICAgZWRpdG9yOiBFZGl0b3IsXHJcbiAgICBwYXN0ZUlkOiBzdHJpbmcsXHJcbiAgICBpbWFnZVVybDogYW55LFxyXG4gICAgbmFtZTogc3RyaW5nID0gXCJcIlxyXG4gICkge1xyXG4gICAgbGV0IHByb2dyZXNzVGV4dCA9IGltYWdlQXV0b1VwbG9hZFBsdWdpbi5wcm9ncmVzc1RleHRGb3IocGFzdGVJZCk7XHJcbiAgICBuYW1lID0gdGhpcy5oYW5kbGVOYW1lKG5hbWUpO1xyXG5cclxuICAgIGxldCBtYXJrRG93bkltYWdlID0gXCJcIjtcclxuICAgIGlmICh0aGlzLnNldHRpbmdzLmFkZFBhbmRvY0ZpZykge1xyXG4gICAgICBjb25zdCB0aW1lc3RhbXAgPSAod2luZG93IGFzIGFueSkubW9tZW50KCkuZm9ybWF0KFwiWVlZWU1NRERISG1tc3NcIik7XHJcbiAgICAgIC8vIOOAkOWFs+mUruS/ruaUueOAke+8mua3u+WKoCB3aWR0aCDlj4LmlbBcclxuICAgICAgY29uc3Qgd2lkdGggPSB0aGlzLnNldHRpbmdzLnBhbmRvY0ltYWdlV2lkdGggfHwgXCIxNGNtXCI7XHJcbiAgICAgIG1hcmtEb3duSW1hZ2UgPSBgIVske25hbWV9XSgke2ltYWdlVXJsfSl7I2ZpZzoke3RpbWVzdGFtcH0gd2lkdGg9JHt3aWR0aH19YDtcclxuICAgIH0gZWxzZSB7XHJcbiAgICAgIG1hcmtEb3duSW1hZ2UgPSBgIVske25hbWV9XSgke2ltYWdlVXJsfSlgO1xyXG4gICAgfVxyXG5cclxuICAgIC8vIOOAkOWFs+mUruS/ruaUueOAke+8mua3u+WKoOepuuihjOmAu+i+kVxyXG4gICAgaWYgKHRoaXMuc2V0dGluZ3MuYWRkTmV3TGluZUFyb3VuZEltYWdlKSB7XHJcbiAgICAgIG1hcmtEb3duSW1hZ2UgPSBgXFxuXFxuJHttYXJrRG93bkltYWdlfVxcblxcbmA7XHJcbiAgICB9XHJcbiAgICAvLyAtLS0g44CQ5L+u5pS557uT5p2f44CRIC0tLVxyXG5cclxuICAgIGltYWdlQXV0b1VwbG9hZFBsdWdpbi5yZXBsYWNlRmlyc3RPY2N1cnJlbmNlKFxyXG4gICAgICBlZGl0b3IsXHJcbiAgICAgIHByb2dyZXNzVGV4dCxcclxuICAgICAgbWFya0Rvd25JbWFnZVxyXG4gICAgKTtcclxuICB9XHJcblxyXG4gIGhhbmRsZUZhaWxlZFVwbG9hZChlZGl0b3I6IEVkaXRvciwgcGFzdGVJZDogc3RyaW5nLCByZWFzb246IGFueSkge1xyXG4gICAgbmV3IE5vdGljZShyZWFzb24pO1xyXG4gICAgY29uc29sZS5lcnJvcihcIkZhaWxlZCByZXF1ZXN0OiBcIiwgcmVhc29uKTtcclxuICAgIGxldCBwcm9ncmVzc1RleHQgPSBpbWFnZUF1dG9VcGxvYWRQbHVnaW4ucHJvZ3Jlc3NUZXh0Rm9yKHBhc3RlSWQpO1xyXG4gICAgaW1hZ2VBdXRvVXBsb2FkUGx1Z2luLnJlcGxhY2VGaXJzdE9jY3VycmVuY2UoXHJcbiAgICAgIGVkaXRvcixcclxuICAgICAgcHJvZ3Jlc3NUZXh0LFxyXG4gICAgICBcIuKaoO+4j3VwbG9hZCBmYWlsZWQsIGNoZWNrIGRldiBjb25zb2xlXCJcclxuICAgICk7XHJcbiAgfVxyXG5cclxuICBoYW5kbGVOYW1lKG5hbWU6IHN0cmluZykge1xyXG4gICAgY29uc3QgaW1hZ2VTaXplU3VmZml4ID0gdGhpcy5zZXR0aW5ncy5pbWFnZVNpemVTdWZmaXggfHwgXCJcIjtcclxuXHJcbiAgICBpZiAodGhpcy5zZXR0aW5ncy5pbWFnZURlc2MgPT09IFwib3JpZ2luXCIpIHtcclxuICAgICAgcmV0dXJuIGAke25hbWV9JHtpbWFnZVNpemVTdWZmaXh9YDtcclxuICAgIH0gZWxzZSBpZiAodGhpcy5zZXR0aW5ncy5pbWFnZURlc2MgPT09IFwibm9uZVwiKSB7XHJcbiAgICAgIHJldHVybiBcIlwiO1xyXG4gICAgfSBlbHNlIGlmICh0aGlzLnNldHRpbmdzLmltYWdlRGVzYyA9PT0gXCJyZW1vdmVEZWZhdWx0XCIpIHtcclxuICAgICAgaWYgKG5hbWUgPT09IFwiaW1hZ2UucG5nXCIpIHtcclxuICAgICAgICByZXR1cm4gXCJcIjtcclxuICAgICAgfSBlbHNlIHtcclxuICAgICAgICByZXR1cm4gYCR7bmFtZX0ke2ltYWdlU2l6ZVN1ZmZpeH1gO1xyXG4gICAgICB9XHJcbiAgICB9IGVsc2Uge1xyXG4gICAgICByZXR1cm4gYCR7bmFtZX0ke2ltYWdlU2l6ZVN1ZmZpeH1gO1xyXG4gICAgfVxyXG4gIH1cclxuXHJcbiAgc3RhdGljIHJlcGxhY2VGaXJzdE9jY3VycmVuY2UoXHJcbiAgICBlZGl0b3I6IEVkaXRvcixcclxuICAgIHRhcmdldDogc3RyaW5nLFxyXG4gICAgcmVwbGFjZW1lbnQ6IHN0cmluZ1xyXG4gICkge1xyXG4gICAgbGV0IGxpbmVzID0gZWRpdG9yLmdldFZhbHVlKCkuc3BsaXQoXCJcXG5cIik7XHJcbiAgICBmb3IgKGxldCBpID0gMDsgaSA8IGxpbmVzLmxlbmd0aDsgaSsrKSB7XHJcbiAgICAgIGxldCBjaCA9IGxpbmVzW2ldLmluZGV4T2YodGFyZ2V0KTtcclxuICAgICAgaWYgKGNoICE9IC0xKSB7XHJcbiAgICAgICAgbGV0IGZyb20gPSB7IGxpbmU6IGksIGNoOiBjaCB9O1xyXG4gICAgICAgIGxldCB0byA9IHsgbGluZTogaSwgY2g6IGNoICsgdGFyZ2V0Lmxlbmd0aCB9O1xyXG4gICAgICAgIGVkaXRvci5yZXBsYWNlUmFuZ2UocmVwbGFjZW1lbnQsIGZyb20sIHRvKTtcclxuICAgICAgICBicmVhaztcclxuICAgICAgfVxyXG4gICAgfVxyXG4gIH1cclxufVxyXG4iXSwibmFtZXMiOlsiZXh0bmFtZSIsIkJ1ZmZlciIsInN0cnRvazMuZnJvbUJ1ZmZlciIsInN0cnRvazMuZnJvbVN0cmVhbSIsInN0cnRvazMuRW5kT2ZTdHJlYW1FcnJvciIsIlRva2VuLlN0cmluZ1R5cGUiLCJUb2tlbi5VSU5UOCIsIlRva2VuLklOVDMyX0JFIiwiVG9rZW4uVUlOVDY0X0xFIiwiVG9rZW4uVUlOVDE2X0JFIiwiVG9rZW4uVUlOVDE2X0xFIiwiVG9rZW4uVUlOVDMyX0JFIiwiVG9rZW4uVUlOVDMyX0xFIiwibW9tZW50IiwicGFyc2UiLCJub3JtYWxpemVQYXRoIiwicmVsYXRpdmUiLCJOb3RpY2UiLCJyZXF1ZXN0VXJsIiwiam9pbiIsImdldEJsb2JBcnJheUJ1ZmZlciIsIlBsYXRmb3JtIiwiTWFya2Rvd25WaWV3IiwiUGx1Z2luU2V0dGluZ1RhYiIsIlNldHRpbmciLCJQbHVnaW4iLCJhZGRJY29uIiwiVEZpbGUiLCJiYXNlbmFtZSIsInJlc29sdmUiLCJkaXJuYW1lIl0sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7Ozs7Q0EwQkEsU0FBUyxVQUFVLENBQUMsSUFBSSxFQUFFO0FBQzFCLEdBQUUsSUFBSSxPQUFPLElBQUksS0FBSyxRQUFRLEVBQUU7QUFDaEMsS0FBSSxNQUFNLElBQUksU0FBUyxDQUFDLGtDQUFrQyxHQUFHLElBQUksQ0FBQyxTQUFTLENBQUMsSUFBSSxDQUFDLENBQUM7QUFDbEY7QUFDQTs7QUFFQTtBQUNBLENBQUEsU0FBUyxvQkFBb0IsQ0FBQyxJQUFJLEVBQUUsY0FBYyxFQUFFO0dBQ2xELElBQUksR0FBRyxHQUFHLEVBQUU7R0FDWixJQUFJLGlCQUFpQixHQUFHLENBQUM7QUFDM0IsR0FBRSxJQUFJLFNBQVMsR0FBRyxDQUFDLENBQUM7R0FDbEIsSUFBSSxJQUFJLEdBQUcsQ0FBQztBQUNkLEdBQUUsSUFBSSxJQUFJO0FBQ1YsR0FBRSxLQUFLLElBQUksQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDLElBQUksSUFBSSxDQUFDLE1BQU0sRUFBRSxFQUFFLENBQUMsRUFBRTtBQUN6QyxLQUFJLElBQUksQ0FBQyxHQUFHLElBQUksQ0FBQyxNQUFNO0FBQ3ZCLE9BQU0sSUFBSSxHQUFHLElBQUksQ0FBQyxVQUFVLENBQUMsQ0FBQyxDQUFDO1VBQ3RCLElBQUksSUFBSSxLQUFLLEVBQUU7T0FDbEI7QUFDTjtPQUNNLElBQUksR0FBRyxFQUFFO0FBQ2YsS0FBSSxJQUFJLElBQUksS0FBSyxFQUFFLFFBQVE7T0FDckIsSUFBSSxTQUFTLEtBQUssQ0FBQyxHQUFHLENBQUMsSUFBSSxJQUFJLEtBQUssQ0FBQyxFQUFFLENBRXRDLE1BQU0sSUFBSSxTQUFTLEtBQUssQ0FBQyxHQUFHLENBQUMsSUFBSSxJQUFJLEtBQUssQ0FBQyxFQUFFO0FBQ3BELFNBQVEsSUFBSSxHQUFHLENBQUMsTUFBTSxHQUFHLENBQUMsSUFBSSxpQkFBaUIsS0FBSyxDQUFDLElBQUksR0FBRyxDQUFDLFVBQVUsQ0FBQyxHQUFHLENBQUMsTUFBTSxHQUFHLENBQUMsQ0FBQyxLQUFLLEVBQUUsVUFBVSxHQUFHLENBQUMsVUFBVSxDQUFDLEdBQUcsQ0FBQyxNQUFNLEdBQUcsQ0FBQyxDQUFDLEtBQUssRUFBRSxRQUFRO0FBQ3JKLFdBQVUsSUFBSSxHQUFHLENBQUMsTUFBTSxHQUFHLENBQUMsRUFBRTthQUNsQixJQUFJLGNBQWMsR0FBRyxHQUFHLENBQUMsV0FBVyxDQUFDLEdBQUcsQ0FBQzthQUN6QyxJQUFJLGNBQWMsS0FBSyxHQUFHLENBQUMsTUFBTSxHQUFHLENBQUMsRUFBRTtBQUNuRCxlQUFjLElBQUksY0FBYyxLQUFLLENBQUMsQ0FBQyxFQUFFO2lCQUN6QixHQUFHLEdBQUcsRUFBRTtpQkFDUixpQkFBaUIsR0FBRyxDQUFDO0FBQ3JDLGdCQUFlLE1BQU07aUJBQ0wsR0FBRyxHQUFHLEdBQUcsQ0FBQyxLQUFLLENBQUMsQ0FBQyxFQUFFLGNBQWMsQ0FBQztBQUNsRCxpQkFBZ0IsaUJBQWlCLEdBQUcsR0FBRyxDQUFDLE1BQU0sR0FBRyxDQUFDLEdBQUcsR0FBRyxDQUFDLFdBQVcsQ0FBQyxHQUFHLENBQUM7QUFDekU7ZUFDYyxTQUFTLEdBQUcsQ0FBQztlQUNiLElBQUksR0FBRyxDQUFDO2VBQ1I7QUFDZDtBQUNBLFlBQVcsTUFBTSxJQUFJLEdBQUcsQ0FBQyxNQUFNLEtBQUssQ0FBQyxJQUFJLEdBQUcsQ0FBQyxNQUFNLEtBQUssQ0FBQyxFQUFFO2FBQy9DLEdBQUcsR0FBRyxFQUFFO2FBQ1IsaUJBQWlCLEdBQUcsQ0FBQzthQUNyQixTQUFTLEdBQUcsQ0FBQzthQUNiLElBQUksR0FBRyxDQUFDO2FBQ1I7QUFDWjtBQUNBO1NBQ1EsSUFBSSxjQUFjLEVBQUU7QUFDNUIsV0FBVSxJQUFJLEdBQUcsQ0FBQyxNQUFNLEdBQUcsQ0FBQzthQUNoQixHQUFHLElBQUksS0FBSztBQUN4QjthQUNZLEdBQUcsR0FBRyxJQUFJO1dBQ1osaUJBQWlCLEdBQUcsQ0FBQztBQUMvQjtBQUNBLFFBQU8sTUFBTTtBQUNiLFNBQVEsSUFBSSxHQUFHLENBQUMsTUFBTSxHQUFHLENBQUM7QUFDMUIsV0FBVSxHQUFHLElBQUksR0FBRyxHQUFHLElBQUksQ0FBQyxLQUFLLENBQUMsU0FBUyxHQUFHLENBQUMsRUFBRSxDQUFDLENBQUM7QUFDbkQ7V0FDVSxHQUFHLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQyxTQUFTLEdBQUcsQ0FBQyxFQUFFLENBQUMsQ0FBQztBQUM1QyxTQUFRLGlCQUFpQixHQUFHLENBQUMsR0FBRyxTQUFTLEdBQUcsQ0FBQztBQUM3QztPQUNNLFNBQVMsR0FBRyxDQUFDO09BQ2IsSUFBSSxHQUFHLENBQUM7TUFDVCxNQUFNLElBQUksSUFBSSxLQUFLLEVBQUUsVUFBVSxJQUFJLEtBQUssQ0FBQyxDQUFDLEVBQUU7QUFDakQsT0FBTSxFQUFFLElBQUk7QUFDWixNQUFLLE1BQU07T0FDTCxJQUFJLEdBQUcsQ0FBQyxDQUFDO0FBQ2Y7QUFDQTtBQUNBLEdBQUUsT0FBTyxHQUFHO0FBQ1o7O0FBRUEsQ0FBQSxTQUFTLE9BQU8sQ0FBQyxHQUFHLEVBQUUsVUFBVSxFQUFFO0dBQ2hDLElBQUksR0FBRyxHQUFHLFVBQVUsQ0FBQyxHQUFHLElBQUksVUFBVSxDQUFDLElBQUk7QUFDN0MsR0FBRSxJQUFJLElBQUksR0FBRyxVQUFVLENBQUMsSUFBSSxJQUFJLENBQUMsVUFBVSxDQUFDLElBQUksSUFBSSxFQUFFLEtBQUssVUFBVSxDQUFDLEdBQUcsSUFBSSxFQUFFLENBQUM7R0FDOUUsSUFBSSxDQUFDLEdBQUcsRUFBRTtBQUNaLEtBQUksT0FBTyxJQUFJO0FBQ2Y7QUFDQSxHQUFFLElBQUksR0FBRyxLQUFLLFVBQVUsQ0FBQyxJQUFJLEVBQUU7S0FDM0IsT0FBTyxHQUFHLEdBQUcsSUFBSTtBQUNyQjtBQUNBLEdBQUUsT0FBTyxHQUFHLEdBQUcsR0FBRyxHQUFHLElBQUk7QUFDekI7O0FBRUEsQ0FBQSxJQUFJLEtBQUssR0FBRztBQUNaO0FBQ0EsR0FBRSxPQUFPLEVBQUUsU0FBUyxPQUFPLEdBQUc7S0FDMUIsSUFBSSxZQUFZLEdBQUcsRUFBRTtLQUNyQixJQUFJLGdCQUFnQixHQUFHLEtBQUs7QUFDaEMsS0FBSSxJQUFJLEdBQUc7O0tBRVAsS0FBSyxJQUFJLENBQUMsR0FBRyxTQUFTLENBQUMsTUFBTSxHQUFHLENBQUMsRUFBRSxDQUFDLElBQUksQ0FBQyxDQUFDLElBQUksQ0FBQyxnQkFBZ0IsRUFBRSxDQUFDLEVBQUUsRUFBRTtBQUMxRSxPQUFNLElBQUksSUFBSTtPQUNSLElBQUksQ0FBQyxJQUFJLENBQUM7QUFDaEIsU0FBUSxJQUFJLEdBQUcsU0FBUyxDQUFDLENBQUMsQ0FBQztZQUNoQjtTQUNILElBQUksR0FBRyxLQUFLLFNBQVM7QUFDN0IsV0FBVSxHQUFHLEdBQUcsT0FBTyxDQUFDLEdBQUcsRUFBRTtTQUNyQixJQUFJLEdBQUcsR0FBRztBQUNsQjs7T0FFTSxVQUFVLENBQUMsSUFBSSxDQUFDOztBQUV0QjtBQUNBLE9BQU0sSUFBSSxJQUFJLENBQUMsTUFBTSxLQUFLLENBQUMsRUFBRTtTQUNyQjtBQUNSOztBQUVBLE9BQU0sWUFBWSxHQUFHLElBQUksR0FBRyxHQUFHLEdBQUcsWUFBWTtPQUN4QyxnQkFBZ0IsR0FBRyxJQUFJLENBQUMsVUFBVSxDQUFDLENBQUMsQ0FBQyxLQUFLLEVBQUU7QUFDbEQ7O0FBRUE7QUFDQTs7QUFFQTtLQUNJLFlBQVksR0FBRyxvQkFBb0IsQ0FBQyxZQUFZLEVBQUUsQ0FBQyxnQkFBZ0IsQ0FBQzs7S0FFcEUsSUFBSSxnQkFBZ0IsRUFBRTtBQUMxQixPQUFNLElBQUksWUFBWSxDQUFDLE1BQU0sR0FBRyxDQUFDO1NBQ3pCLE9BQU8sR0FBRyxHQUFHLFlBQVk7QUFDakM7QUFDQSxTQUFRLE9BQU8sR0FBRztBQUNsQixNQUFLLE1BQU0sSUFBSSxZQUFZLENBQUMsTUFBTSxHQUFHLENBQUMsRUFBRTtBQUN4QyxPQUFNLE9BQU8sWUFBWTtBQUN6QixNQUFLLE1BQU07QUFDWCxPQUFNLE9BQU8sR0FBRztBQUNoQjtJQUNHOztBQUVILEdBQUUsU0FBUyxFQUFFLFNBQVMsU0FBUyxDQUFDLElBQUksRUFBRTtLQUNsQyxVQUFVLENBQUMsSUFBSSxDQUFDOztLQUVoQixJQUFJLElBQUksQ0FBQyxNQUFNLEtBQUssQ0FBQyxFQUFFLE9BQU8sR0FBRzs7S0FFakMsSUFBSSxVQUFVLEdBQUcsSUFBSSxDQUFDLFVBQVUsQ0FBQyxDQUFDLENBQUMsS0FBSyxFQUFFO0FBQzlDLEtBQUksSUFBSSxpQkFBaUIsR0FBRyxJQUFJLENBQUMsVUFBVSxDQUFDLElBQUksQ0FBQyxNQUFNLEdBQUcsQ0FBQyxDQUFDLEtBQUssRUFBRTs7QUFFbkU7S0FDSSxJQUFJLEdBQUcsb0JBQW9CLENBQUMsSUFBSSxFQUFFLENBQUMsVUFBVSxDQUFDOztBQUVsRCxLQUFJLElBQUksSUFBSSxDQUFDLE1BQU0sS0FBSyxDQUFDLElBQUksQ0FBQyxVQUFVLEVBQUUsSUFBSSxHQUFHLEdBQUc7S0FDaEQsSUFBSSxJQUFJLENBQUMsTUFBTSxHQUFHLENBQUMsSUFBSSxpQkFBaUIsRUFBRSxJQUFJLElBQUksR0FBRzs7QUFFekQsS0FBSSxJQUFJLFVBQVUsRUFBRSxPQUFPLEdBQUcsR0FBRyxJQUFJO0FBQ3JDLEtBQUksT0FBTyxJQUFJO0lBQ1o7O0FBRUgsR0FBRSxVQUFVLEVBQUUsU0FBUyxVQUFVLENBQUMsSUFBSSxFQUFFO0tBQ3BDLFVBQVUsQ0FBQyxJQUFJLENBQUM7QUFDcEIsS0FBSSxPQUFPLElBQUksQ0FBQyxNQUFNLEdBQUcsQ0FBQyxJQUFJLElBQUksQ0FBQyxVQUFVLENBQUMsQ0FBQyxDQUFDLEtBQUssRUFBRTtJQUNwRDs7QUFFSCxHQUFFLElBQUksRUFBRSxTQUFTLElBQUksR0FBRztBQUN4QixLQUFJLElBQUksU0FBUyxDQUFDLE1BQU0sS0FBSyxDQUFDO0FBQzlCLE9BQU0sT0FBTyxHQUFHO0FBQ2hCLEtBQUksSUFBSSxNQUFNO0FBQ2QsS0FBSSxLQUFLLElBQUksQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDLEdBQUcsU0FBUyxDQUFDLE1BQU0sRUFBRSxFQUFFLENBQUMsRUFBRTtBQUMvQyxPQUFNLElBQUksR0FBRyxHQUFHLFNBQVMsQ0FBQyxDQUFDLENBQUM7T0FDdEIsVUFBVSxDQUFDLEdBQUcsQ0FBQztBQUNyQixPQUFNLElBQUksR0FBRyxDQUFDLE1BQU0sR0FBRyxDQUFDLEVBQUU7U0FDbEIsSUFBSSxNQUFNLEtBQUssU0FBUztXQUN0QixNQUFNLEdBQUcsR0FBRztBQUN0QjtBQUNBLFdBQVUsTUFBTSxJQUFJLEdBQUcsR0FBRyxHQUFHO0FBQzdCO0FBQ0E7S0FDSSxJQUFJLE1BQU0sS0FBSyxTQUFTO0FBQzVCLE9BQU0sT0FBTyxHQUFHO0FBQ2hCLEtBQUksT0FBTyxLQUFLLENBQUMsU0FBUyxDQUFDLE1BQU0sQ0FBQztJQUMvQjs7R0FFRCxRQUFRLEVBQUUsU0FBUyxRQUFRLENBQUMsSUFBSSxFQUFFLEVBQUUsRUFBRTtLQUNwQyxVQUFVLENBQUMsSUFBSSxDQUFDO0tBQ2hCLFVBQVUsQ0FBQyxFQUFFLENBQUM7O0FBRWxCLEtBQUksSUFBSSxJQUFJLEtBQUssRUFBRSxFQUFFLE9BQU8sRUFBRTs7QUFFOUIsS0FBSSxJQUFJLEdBQUcsS0FBSyxDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUM7QUFDOUIsS0FBSSxFQUFFLEdBQUcsS0FBSyxDQUFDLE9BQU8sQ0FBQyxFQUFFLENBQUM7O0FBRTFCLEtBQUksSUFBSSxJQUFJLEtBQUssRUFBRSxFQUFFLE9BQU8sRUFBRTs7QUFFOUI7S0FDSSxJQUFJLFNBQVMsR0FBRyxDQUFDO0tBQ2pCLE9BQU8sU0FBUyxHQUFHLElBQUksQ0FBQyxNQUFNLEVBQUUsRUFBRSxTQUFTLEVBQUU7T0FDM0MsSUFBSSxJQUFJLENBQUMsVUFBVSxDQUFDLFNBQVMsQ0FBQyxLQUFLLEVBQUU7U0FDbkM7QUFDUjtBQUNBLEtBQUksSUFBSSxPQUFPLEdBQUcsSUFBSSxDQUFDLE1BQU07QUFDN0IsS0FBSSxJQUFJLE9BQU8sR0FBRyxPQUFPLEdBQUcsU0FBUzs7QUFFckM7S0FDSSxJQUFJLE9BQU8sR0FBRyxDQUFDO0tBQ2YsT0FBTyxPQUFPLEdBQUcsRUFBRSxDQUFDLE1BQU0sRUFBRSxFQUFFLE9BQU8sRUFBRTtPQUNyQyxJQUFJLEVBQUUsQ0FBQyxVQUFVLENBQUMsT0FBTyxDQUFDLEtBQUssRUFBRTtTQUMvQjtBQUNSO0FBQ0EsS0FBSSxJQUFJLEtBQUssR0FBRyxFQUFFLENBQUMsTUFBTTtBQUN6QixLQUFJLElBQUksS0FBSyxHQUFHLEtBQUssR0FBRyxPQUFPOztBQUUvQjtLQUNJLElBQUksTUFBTSxHQUFHLE9BQU8sR0FBRyxLQUFLLEdBQUcsT0FBTyxHQUFHLEtBQUs7QUFDbEQsS0FBSSxJQUFJLGFBQWEsR0FBRyxDQUFDLENBQUM7S0FDdEIsSUFBSSxDQUFDLEdBQUcsQ0FBQztBQUNiLEtBQUksT0FBTyxDQUFDLElBQUksTUFBTSxFQUFFLEVBQUUsQ0FBQyxFQUFFO0FBQzdCLE9BQU0sSUFBSSxDQUFDLEtBQUssTUFBTSxFQUFFO0FBQ3hCLFNBQVEsSUFBSSxLQUFLLEdBQUcsTUFBTSxFQUFFO1dBQ2xCLElBQUksRUFBRSxDQUFDLFVBQVUsQ0FBQyxPQUFPLEdBQUcsQ0FBQyxDQUFDLEtBQUssRUFBRSxRQUFRO0FBQ3ZEO0FBQ0E7YUFDWSxPQUFPLEVBQUUsQ0FBQyxLQUFLLENBQUMsT0FBTyxHQUFHLENBQUMsR0FBRyxDQUFDLENBQUM7QUFDNUMsWUFBVyxNQUFNLElBQUksQ0FBQyxLQUFLLENBQUMsRUFBRTtBQUM5QjtBQUNBO2FBQ1ksT0FBTyxFQUFFLENBQUMsS0FBSyxDQUFDLE9BQU8sR0FBRyxDQUFDLENBQUM7QUFDeEM7QUFDQSxVQUFTLE1BQU0sSUFBSSxPQUFPLEdBQUcsTUFBTSxFQUFFO1dBQzNCLElBQUksSUFBSSxDQUFDLFVBQVUsQ0FBQyxTQUFTLEdBQUcsQ0FBQyxDQUFDLEtBQUssRUFBRSxRQUFRO0FBQzNEO0FBQ0E7YUFDWSxhQUFhLEdBQUcsQ0FBQztBQUM3QixZQUFXLE1BQU0sSUFBSSxDQUFDLEtBQUssQ0FBQyxFQUFFO0FBQzlCO0FBQ0E7YUFDWSxhQUFhLEdBQUcsQ0FBQztBQUM3QjtBQUNBO1NBQ1E7QUFDUjtPQUNNLElBQUksUUFBUSxHQUFHLElBQUksQ0FBQyxVQUFVLENBQUMsU0FBUyxHQUFHLENBQUMsQ0FBQztPQUM3QyxJQUFJLE1BQU0sR0FBRyxFQUFFLENBQUMsVUFBVSxDQUFDLE9BQU8sR0FBRyxDQUFDLENBQUM7T0FDdkMsSUFBSSxRQUFRLEtBQUssTUFBTTtTQUNyQjtZQUNHLElBQUksUUFBUSxLQUFLLEVBQUU7U0FDdEIsYUFBYSxHQUFHLENBQUM7QUFDekI7O0tBRUksSUFBSSxHQUFHLEdBQUcsRUFBRTtBQUNoQjtBQUNBO0FBQ0EsS0FBSSxLQUFLLENBQUMsR0FBRyxTQUFTLEdBQUcsYUFBYSxHQUFHLENBQUMsRUFBRSxDQUFDLElBQUksT0FBTyxFQUFFLEVBQUUsQ0FBQyxFQUFFO0FBQy9ELE9BQU0sSUFBSSxDQUFDLEtBQUssT0FBTyxJQUFJLElBQUksQ0FBQyxVQUFVLENBQUMsQ0FBQyxDQUFDLEtBQUssRUFBRSxRQUFRO0FBQzVELFNBQVEsSUFBSSxHQUFHLENBQUMsTUFBTSxLQUFLLENBQUM7V0FDbEIsR0FBRyxJQUFJLElBQUk7QUFDckI7V0FDVSxHQUFHLElBQUksS0FBSztBQUN0QjtBQUNBOztBQUVBO0FBQ0E7QUFDQSxLQUFJLElBQUksR0FBRyxDQUFDLE1BQU0sR0FBRyxDQUFDO09BQ2hCLE9BQU8sR0FBRyxHQUFHLEVBQUUsQ0FBQyxLQUFLLENBQUMsT0FBTyxHQUFHLGFBQWEsQ0FBQztVQUMzQztPQUNILE9BQU8sSUFBSSxhQUFhO09BQ3hCLElBQUksRUFBRSxDQUFDLFVBQVUsQ0FBQyxPQUFPLENBQUMsS0FBSyxFQUFFO0FBQ3ZDLFNBQVEsRUFBRSxPQUFPO0FBQ2pCLE9BQU0sT0FBTyxFQUFFLENBQUMsS0FBSyxDQUFDLE9BQU8sQ0FBQztBQUM5QjtJQUNHOztBQUVILEdBQUUsU0FBUyxFQUFFLFNBQVMsU0FBUyxDQUFDLElBQUksRUFBRTtBQUN0QyxLQUFJLE9BQU8sSUFBSTtJQUNaOztBQUVILEdBQUUsT0FBTyxFQUFFLFNBQVMsT0FBTyxDQUFDLElBQUksRUFBRTtLQUM5QixVQUFVLENBQUMsSUFBSSxDQUFDO0tBQ2hCLElBQUksSUFBSSxDQUFDLE1BQU0sS0FBSyxDQUFDLEVBQUUsT0FBTyxHQUFHO0tBQ2pDLElBQUksSUFBSSxHQUFHLElBQUksQ0FBQyxVQUFVLENBQUMsQ0FBQyxDQUFDO0FBQ2pDLEtBQUksSUFBSSxPQUFPLEdBQUcsSUFBSSxLQUFLLEVBQUU7QUFDN0IsS0FBSSxJQUFJLEdBQUcsR0FBRyxDQUFDLENBQUM7S0FDWixJQUFJLFlBQVksR0FBRyxJQUFJO0FBQzNCLEtBQUksS0FBSyxJQUFJLENBQUMsR0FBRyxJQUFJLENBQUMsTUFBTSxHQUFHLENBQUMsRUFBRSxDQUFDLElBQUksQ0FBQyxFQUFFLEVBQUUsQ0FBQyxFQUFFO0FBQy9DLE9BQU0sSUFBSSxHQUFHLElBQUksQ0FBQyxVQUFVLENBQUMsQ0FBQyxDQUFDO0FBQy9CLE9BQU0sSUFBSSxJQUFJLEtBQUssRUFBRSxRQUFRO1dBQ25CLElBQUksQ0FBQyxZQUFZLEVBQUU7YUFDakIsR0FBRyxHQUFHLENBQUM7YUFDUDtBQUNaO0FBQ0EsVUFBUyxNQUFNO0FBQ2Y7U0FDUSxZQUFZLEdBQUcsS0FBSztBQUM1QjtBQUNBOztLQUVJLElBQUksR0FBRyxLQUFLLENBQUMsQ0FBQyxFQUFFLE9BQU8sT0FBTyxHQUFHLEdBQUcsR0FBRyxHQUFHO0tBQzFDLElBQUksT0FBTyxJQUFJLEdBQUcsS0FBSyxDQUFDLEVBQUUsT0FBTyxJQUFJO0tBQ3JDLE9BQU8sSUFBSSxDQUFDLEtBQUssQ0FBQyxDQUFDLEVBQUUsR0FBRyxDQUFDO0lBQzFCOztHQUVELFFBQVEsRUFBRSxTQUFTLFFBQVEsQ0FBQyxJQUFJLEVBQUUsR0FBRyxFQUFFO0FBQ3pDLEtBQUksSUFBSSxHQUFHLEtBQUssU0FBUyxJQUFJLE9BQU8sR0FBRyxLQUFLLFFBQVEsRUFBRSxNQUFNLElBQUksU0FBUyxDQUFDLGlDQUFpQyxDQUFDO0tBQ3hHLFVBQVUsQ0FBQyxJQUFJLENBQUM7O0tBRWhCLElBQUksS0FBSyxHQUFHLENBQUM7QUFDakIsS0FBSSxJQUFJLEdBQUcsR0FBRyxDQUFDLENBQUM7S0FDWixJQUFJLFlBQVksR0FBRyxJQUFJO0FBQzNCLEtBQUksSUFBSSxDQUFDOztBQUVULEtBQUksSUFBSSxHQUFHLEtBQUssU0FBUyxJQUFJLEdBQUcsQ0FBQyxNQUFNLEdBQUcsQ0FBQyxJQUFJLEdBQUcsQ0FBQyxNQUFNLElBQUksSUFBSSxDQUFDLE1BQU0sRUFBRTtBQUMxRSxPQUFNLElBQUksR0FBRyxDQUFDLE1BQU0sS0FBSyxJQUFJLENBQUMsTUFBTSxJQUFJLEdBQUcsS0FBSyxJQUFJLEVBQUUsT0FBTyxFQUFFO0FBQy9ELE9BQU0sSUFBSSxNQUFNLEdBQUcsR0FBRyxDQUFDLE1BQU0sR0FBRyxDQUFDO0FBQ2pDLE9BQU0sSUFBSSxnQkFBZ0IsR0FBRyxDQUFDLENBQUM7QUFDL0IsT0FBTSxLQUFLLENBQUMsR0FBRyxJQUFJLENBQUMsTUFBTSxHQUFHLENBQUMsRUFBRSxDQUFDLElBQUksQ0FBQyxFQUFFLEVBQUUsQ0FBQyxFQUFFO1NBQ3JDLElBQUksSUFBSSxHQUFHLElBQUksQ0FBQyxVQUFVLENBQUMsQ0FBQyxDQUFDO0FBQ3JDLFNBQVEsSUFBSSxJQUFJLEtBQUssRUFBRSxRQUFRO0FBQy9CO0FBQ0E7YUFDWSxJQUFJLENBQUMsWUFBWSxFQUFFO0FBQy9CLGVBQWMsS0FBSyxHQUFHLENBQUMsR0FBRyxDQUFDO2VBQ2I7QUFDZDtBQUNBLFlBQVcsTUFBTTtBQUNqQixXQUFVLElBQUksZ0JBQWdCLEtBQUssQ0FBQyxDQUFDLEVBQUU7QUFDdkM7QUFDQTthQUNZLFlBQVksR0FBRyxLQUFLO0FBQ2hDLGFBQVksZ0JBQWdCLEdBQUcsQ0FBQyxHQUFHLENBQUM7QUFDcEM7QUFDQSxXQUFVLElBQUksTUFBTSxJQUFJLENBQUMsRUFBRTtBQUMzQjthQUNZLElBQUksSUFBSSxLQUFLLEdBQUcsQ0FBQyxVQUFVLENBQUMsTUFBTSxDQUFDLEVBQUU7QUFDakQsZUFBYyxJQUFJLEVBQUUsTUFBTSxLQUFLLENBQUMsQ0FBQyxFQUFFO0FBQ25DO0FBQ0E7aUJBQ2dCLEdBQUcsR0FBRyxDQUFDO0FBQ3ZCO0FBQ0EsY0FBYSxNQUFNO0FBQ25CO0FBQ0E7ZUFDYyxNQUFNLEdBQUcsQ0FBQyxDQUFDO2VBQ1gsR0FBRyxHQUFHLGdCQUFnQjtBQUNwQztBQUNBO0FBQ0E7QUFDQTs7T0FFTSxJQUFJLEtBQUssS0FBSyxHQUFHLEVBQUUsR0FBRyxHQUFHLGdCQUFnQixDQUFDLEtBQUssSUFBSSxHQUFHLEtBQUssQ0FBQyxDQUFDLEVBQUUsR0FBRyxHQUFHLElBQUksQ0FBQyxNQUFNO09BQ2hGLE9BQU8sSUFBSSxDQUFDLEtBQUssQ0FBQyxLQUFLLEVBQUUsR0FBRyxDQUFDO0FBQ25DLE1BQUssTUFBTTtBQUNYLE9BQU0sS0FBSyxDQUFDLEdBQUcsSUFBSSxDQUFDLE1BQU0sR0FBRyxDQUFDLEVBQUUsQ0FBQyxJQUFJLENBQUMsRUFBRSxFQUFFLENBQUMsRUFBRTtTQUNyQyxJQUFJLElBQUksQ0FBQyxVQUFVLENBQUMsQ0FBQyxDQUFDLEtBQUssRUFBRSxRQUFRO0FBQzdDO0FBQ0E7YUFDWSxJQUFJLENBQUMsWUFBWSxFQUFFO0FBQy9CLGVBQWMsS0FBSyxHQUFHLENBQUMsR0FBRyxDQUFDO2VBQ2I7QUFDZDtBQUNBLFlBQVcsTUFBTSxJQUFJLEdBQUcsS0FBSyxDQUFDLENBQUMsRUFBRTtBQUNqQztBQUNBO1dBQ1UsWUFBWSxHQUFHLEtBQUs7QUFDOUIsV0FBVSxHQUFHLEdBQUcsQ0FBQyxHQUFHLENBQUM7QUFDckI7QUFDQTs7QUFFQSxPQUFNLElBQUksR0FBRyxLQUFLLENBQUMsQ0FBQyxFQUFFLE9BQU8sRUFBRTtPQUN6QixPQUFPLElBQUksQ0FBQyxLQUFLLENBQUMsS0FBSyxFQUFFLEdBQUcsQ0FBQztBQUNuQztJQUNHOztBQUVILEdBQUUsT0FBTyxFQUFFLFNBQVMsT0FBTyxDQUFDLElBQUksRUFBRTtLQUM5QixVQUFVLENBQUMsSUFBSSxDQUFDO0FBQ3BCLEtBQUksSUFBSSxRQUFRLEdBQUcsQ0FBQyxDQUFDO0tBQ2pCLElBQUksU0FBUyxHQUFHLENBQUM7QUFDckIsS0FBSSxJQUFJLEdBQUcsR0FBRyxDQUFDLENBQUM7S0FDWixJQUFJLFlBQVksR0FBRyxJQUFJO0FBQzNCO0FBQ0E7S0FDSSxJQUFJLFdBQVcsR0FBRyxDQUFDO0FBQ3ZCLEtBQUksS0FBSyxJQUFJLENBQUMsR0FBRyxJQUFJLENBQUMsTUFBTSxHQUFHLENBQUMsRUFBRSxDQUFDLElBQUksQ0FBQyxFQUFFLEVBQUUsQ0FBQyxFQUFFO09BQ3pDLElBQUksSUFBSSxHQUFHLElBQUksQ0FBQyxVQUFVLENBQUMsQ0FBQyxDQUFDO0FBQ25DLE9BQU0sSUFBSSxJQUFJLEtBQUssRUFBRSxRQUFRO0FBQzdCO0FBQ0E7V0FDVSxJQUFJLENBQUMsWUFBWSxFQUFFO0FBQzdCLGFBQVksU0FBUyxHQUFHLENBQUMsR0FBRyxDQUFDO2FBQ2pCO0FBQ1o7V0FDVTtBQUNWO0FBQ0EsT0FBTSxJQUFJLEdBQUcsS0FBSyxDQUFDLENBQUMsRUFBRTtBQUN0QjtBQUNBO1NBQ1EsWUFBWSxHQUFHLEtBQUs7QUFDNUIsU0FBUSxHQUFHLEdBQUcsQ0FBQyxHQUFHLENBQUM7QUFDbkI7QUFDQSxPQUFNLElBQUksSUFBSSxLQUFLLEVBQUUsUUFBUTtBQUM3QjtBQUNBLFdBQVUsSUFBSSxRQUFRLEtBQUssQ0FBQyxDQUFDO2FBQ2pCLFFBQVEsR0FBRyxDQUFDO2dCQUNULElBQUksV0FBVyxLQUFLLENBQUM7YUFDeEIsV0FBVyxHQUFHLENBQUM7QUFDM0IsUUFBTyxNQUFNLElBQUksUUFBUSxLQUFLLENBQUMsQ0FBQyxFQUFFO0FBQ2xDO0FBQ0E7U0FDUSxXQUFXLEdBQUcsQ0FBQyxDQUFDO0FBQ3hCO0FBQ0E7O0tBRUksSUFBSSxRQUFRLEtBQUssQ0FBQyxDQUFDLElBQUksR0FBRyxLQUFLLENBQUMsQ0FBQztBQUNyQztTQUNRLFdBQVcsS0FBSyxDQUFDO0FBQ3pCO0FBQ0EsU0FBUSxXQUFXLEtBQUssQ0FBQyxJQUFJLFFBQVEsS0FBSyxHQUFHLEdBQUcsQ0FBQyxJQUFJLFFBQVEsS0FBSyxTQUFTLEdBQUcsQ0FBQyxFQUFFO0FBQ2pGLE9BQU0sT0FBTyxFQUFFO0FBQ2Y7S0FDSSxPQUFPLElBQUksQ0FBQyxLQUFLLENBQUMsUUFBUSxFQUFFLEdBQUcsQ0FBQztJQUNqQzs7QUFFSCxHQUFFLE1BQU0sRUFBRSxTQUFTLE1BQU0sQ0FBQyxVQUFVLEVBQUU7S0FDbEMsSUFBSSxVQUFVLEtBQUssSUFBSSxJQUFJLE9BQU8sVUFBVSxLQUFLLFFBQVEsRUFBRTtPQUN6RCxNQUFNLElBQUksU0FBUyxDQUFDLGtFQUFrRSxHQUFHLE9BQU8sVUFBVSxDQUFDO0FBQ2pIO0FBQ0EsS0FBSSxPQUFPLE9BQU8sQ0FBQyxHQUFHLEVBQUUsVUFBVSxDQUFDO0lBQ2hDOztBQUVILEdBQUUsS0FBSyxFQUFFLFNBQVMsS0FBSyxDQUFDLElBQUksRUFBRTtLQUMxQixVQUFVLENBQUMsSUFBSSxDQUFDOztLQUVoQixJQUFJLEdBQUcsR0FBRyxFQUFFLElBQUksRUFBRSxFQUFFLEVBQUUsR0FBRyxFQUFFLEVBQUUsRUFBRSxJQUFJLEVBQUUsRUFBRSxFQUFFLEdBQUcsRUFBRSxFQUFFLEVBQUUsSUFBSSxFQUFFLEVBQUUsRUFBRTtLQUM1RCxJQUFJLElBQUksQ0FBQyxNQUFNLEtBQUssQ0FBQyxFQUFFLE9BQU8sR0FBRztLQUNqQyxJQUFJLElBQUksR0FBRyxJQUFJLENBQUMsVUFBVSxDQUFDLENBQUMsQ0FBQztBQUNqQyxLQUFJLElBQUksVUFBVSxHQUFHLElBQUksS0FBSyxFQUFFO0FBQ2hDLEtBQUksSUFBSSxLQUFLO0tBQ1QsSUFBSSxVQUFVLEVBQUU7QUFDcEIsT0FBTSxHQUFHLENBQUMsSUFBSSxHQUFHLEdBQUc7T0FDZCxLQUFLLEdBQUcsQ0FBQztBQUNmLE1BQUssTUFBTTtPQUNMLEtBQUssR0FBRyxDQUFDO0FBQ2Y7QUFDQSxLQUFJLElBQUksUUFBUSxHQUFHLENBQUMsQ0FBQztLQUNqQixJQUFJLFNBQVMsR0FBRyxDQUFDO0FBQ3JCLEtBQUksSUFBSSxHQUFHLEdBQUcsQ0FBQyxDQUFDO0tBQ1osSUFBSSxZQUFZLEdBQUcsSUFBSTtBQUMzQixLQUFJLElBQUksQ0FBQyxHQUFHLElBQUksQ0FBQyxNQUFNLEdBQUcsQ0FBQzs7QUFFM0I7QUFDQTtLQUNJLElBQUksV0FBVyxHQUFHLENBQUM7O0FBRXZCO0FBQ0EsS0FBSSxPQUFPLENBQUMsSUFBSSxLQUFLLEVBQUUsRUFBRSxDQUFDLEVBQUU7QUFDNUIsT0FBTSxJQUFJLEdBQUcsSUFBSSxDQUFDLFVBQVUsQ0FBQyxDQUFDLENBQUM7QUFDL0IsT0FBTSxJQUFJLElBQUksS0FBSyxFQUFFLFFBQVE7QUFDN0I7QUFDQTtXQUNVLElBQUksQ0FBQyxZQUFZLEVBQUU7QUFDN0IsYUFBWSxTQUFTLEdBQUcsQ0FBQyxHQUFHLENBQUM7YUFDakI7QUFDWjtXQUNVO0FBQ1Y7QUFDQSxPQUFNLElBQUksR0FBRyxLQUFLLENBQUMsQ0FBQyxFQUFFO0FBQ3RCO0FBQ0E7U0FDUSxZQUFZLEdBQUcsS0FBSztBQUM1QixTQUFRLEdBQUcsR0FBRyxDQUFDLEdBQUcsQ0FBQztBQUNuQjtBQUNBLE9BQU0sSUFBSSxJQUFJLEtBQUssRUFBRSxRQUFRO0FBQzdCO0FBQ0EsV0FBVSxJQUFJLFFBQVEsS0FBSyxDQUFDLENBQUMsRUFBRSxRQUFRLEdBQUcsQ0FBQyxDQUFDLEtBQUssSUFBSSxXQUFXLEtBQUssQ0FBQyxFQUFFLFdBQVcsR0FBRyxDQUFDO0FBQ3ZGLFVBQVMsTUFBTSxJQUFJLFFBQVEsS0FBSyxDQUFDLENBQUMsRUFBRTtBQUNwQztBQUNBO1NBQ1EsV0FBVyxHQUFHLENBQUMsQ0FBQztBQUN4QjtBQUNBOztLQUVJLElBQUksUUFBUSxLQUFLLENBQUMsQ0FBQyxJQUFJLEdBQUcsS0FBSyxDQUFDLENBQUM7QUFDckM7S0FDSSxXQUFXLEtBQUssQ0FBQztBQUNyQjtBQUNBLEtBQUksV0FBVyxLQUFLLENBQUMsSUFBSSxRQUFRLEtBQUssR0FBRyxHQUFHLENBQUMsSUFBSSxRQUFRLEtBQUssU0FBUyxHQUFHLENBQUMsRUFBRTtBQUM3RSxPQUFNLElBQUksR0FBRyxLQUFLLENBQUMsQ0FBQyxFQUFFO0FBQ3RCLFNBQVEsSUFBSSxTQUFTLEtBQUssQ0FBQyxJQUFJLFVBQVUsRUFBRSxHQUFHLENBQUMsSUFBSSxHQUFHLEdBQUcsQ0FBQyxJQUFJLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQyxDQUFDLEVBQUUsR0FBRyxDQUFDLENBQUMsS0FBSyxHQUFHLENBQUMsSUFBSSxHQUFHLEdBQUcsQ0FBQyxJQUFJLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQyxTQUFTLEVBQUUsR0FBRyxDQUFDO0FBQ3pJO0FBQ0EsTUFBSyxNQUFNO0FBQ1gsT0FBTSxJQUFJLFNBQVMsS0FBSyxDQUFDLElBQUksVUFBVSxFQUFFO1NBQ2pDLEdBQUcsQ0FBQyxJQUFJLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQyxDQUFDLEVBQUUsUUFBUSxDQUFDO1NBQ2xDLEdBQUcsQ0FBQyxJQUFJLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQyxDQUFDLEVBQUUsR0FBRyxDQUFDO0FBQ3JDLFFBQU8sTUFBTTtTQUNMLEdBQUcsQ0FBQyxJQUFJLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQyxTQUFTLEVBQUUsUUFBUSxDQUFDO1NBQzFDLEdBQUcsQ0FBQyxJQUFJLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQyxTQUFTLEVBQUUsR0FBRyxDQUFDO0FBQzdDO09BQ00sR0FBRyxDQUFDLEdBQUcsR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFDLFFBQVEsRUFBRSxHQUFHLENBQUM7QUFDekM7O0FBRUEsS0FBSSxJQUFJLFNBQVMsR0FBRyxDQUFDLEVBQUUsR0FBRyxDQUFDLEdBQUcsR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFDLENBQUMsRUFBRSxTQUFTLEdBQUcsQ0FBQyxDQUFDLENBQUMsS0FBSyxJQUFJLFVBQVUsRUFBRSxHQUFHLENBQUMsR0FBRyxHQUFHLEdBQUc7O0FBRWhHLEtBQUksT0FBTyxHQUFHO0lBQ1g7O0dBRUQsR0FBRyxFQUFFLEdBQUc7R0FDUixTQUFTLEVBQUUsR0FBRztHQUNkLEtBQUssRUFBRSxJQUFJO0FBQ2IsR0FBRSxLQUFLLEVBQUU7RUFDUjs7Q0FFRCxLQUFLLENBQUMsS0FBSyxHQUFHLEtBQUs7O0FBRW5CLENBQUEsY0FBYyxHQUFHLEtBQUs7Ozs7OztBQ3pnQnRCLE1BQU0sY0FBYyxHQUFHO0lBQ3JCLE1BQU07SUFDTixNQUFNO0lBQ04sT0FBTztJQUNQLE1BQU07SUFDTixNQUFNO0lBQ04sTUFBTTtJQUNOLE9BQU87SUFDUCxPQUFPO0lBQ1AsT0FBTztDQUNSO0FBRUssU0FBVSxTQUFTLENBQUMsR0FBVyxFQUFBO0lBQ25DLE9BQU8sY0FBYyxDQUFDLFFBQVEsQ0FBQyxHQUFHLENBQUMsV0FBVyxFQUFFLENBQUM7QUFDbkQ7QUFDTSxTQUFVLGtCQUFrQixDQUFDLElBQVksRUFBQTtBQUM3QyxJQUFBLE9BQU8sU0FBUyxDQUFDQSw2QkFBTyxDQUFDLElBQUksQ0FBQyxDQUFDO0FBQ2pDO0FBRU8sZUFBZSxjQUFjLENBQUMsTUFBZ0IsRUFBQTtJQUNuRCxNQUFNLE1BQU0sR0FBRyxFQUFFO0FBRWpCLElBQUEsV0FBVyxNQUFNLEtBQUssSUFBSSxNQUFNLEVBQUU7UUFDaEMsTUFBTSxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxDQUFDOzs7SUFJakMsT0FBTyxNQUFNLENBQUMsTUFBTSxDQUFDLE1BQU0sQ0FBQyxDQUFDLFFBQVEsQ0FBQyxPQUFPLENBQUM7QUFDaEQ7QUFFTSxTQUFVLFdBQVcsQ0FBQyxHQUFXLEVBQUE7QUFDckMsSUFBQSxPQUFPLENBQUMsR0FBRyxHQUFHLEdBQUcsQ0FBQyxNQUFNLENBQUMsQ0FBQyxHQUFHLEdBQUcsQ0FBQyxXQUFXLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDLEVBQUUsS0FBSyxDQUNyRSxHQUFHLENBQ0osQ0FBQyxDQUFDLENBQUM7QUFDTjtBQUVNLFNBQVUsWUFBWSxDQUFDLElBQWMsRUFBQTtBQUN6QyxJQUFBLE1BQU0sWUFBWSxHQUFHLElBQUksQ0FBQyxPQUFPLEVBQUU7QUFDbkMsSUFBQSxJQUFJLFNBQVM7QUFDYixJQUFBLFlBQVksQ0FBQyxPQUFPLENBQUMsSUFBSSxJQUFHO1FBQzFCLElBQUksSUFBSSxJQUFJLElBQUksQ0FBQyxVQUFVLENBQUMsTUFBTSxDQUFDLEVBQUU7WUFDbkMsU0FBUyxHQUFHLElBQUk7QUFDaEIsWUFBQSxPQUFPLElBQUk7O0FBRWYsS0FBQyxDQUFDO0FBQ0YsSUFBQSxPQUFPLFNBQVM7QUFDbEI7QUFNZ0IsU0FBQSxhQUFhLENBQzNCLEdBQVEsRUFDUixHQUFXLEVBQUE7SUFFWCxNQUFNLEdBQUcsR0FBeUIsRUFBRTtBQUNwQyxJQUFBLEdBQUcsQ0FBQyxPQUFPLENBQUMsT0FBTyxJQUFHO1FBQ3BCLEdBQUcsQ0FBQyxPQUFPLENBQUMsR0FBRyxDQUFDLENBQUMsR0FBRyxPQUFPO0FBQzdCLEtBQUMsQ0FBQztBQUNGLElBQUEsT0FBTyxHQUFHO0FBQ1o7QUFFTSxTQUFVLG1CQUFtQixDQUFDLE1BQWMsRUFBQTtJQUNoRCxNQUFNLFdBQVcsR0FBRyxJQUFJLFdBQVcsQ0FBQyxNQUFNLENBQUMsTUFBTSxDQUFDO0FBQ2xELElBQUEsTUFBTSxJQUFJLEdBQUcsSUFBSSxVQUFVLENBQUMsV0FBVyxDQUFDO0FBQ3hDLElBQUEsS0FBSyxJQUFJLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxHQUFHLE1BQU0sQ0FBQyxNQUFNLEVBQUUsQ0FBQyxFQUFFLEVBQUU7UUFDdEMsSUFBSSxDQUFDLENBQUMsQ0FBQyxHQUFHLE1BQU0sQ0FBQyxDQUFDLENBQUM7O0FBRXJCLElBQUEsT0FBTyxXQUFXO0FBQ3BCO1NBV2dCLElBQUksR0FBQTtBQUNsQixJQUFBLE9BQU8sSUFBSSxDQUFDLE1BQU0sRUFBRSxDQUFDLFFBQVEsQ0FBQyxFQUFFLENBQUMsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDO0FBQzVDOztBQ3hGQTtBQUNBLFNBQVMsRUFBRSxDQUFDLEtBQUssRUFBRTtBQUNuQixJQUFJLE9BQU8sSUFBSSxRQUFRLENBQUMsS0FBSyxDQUFDLE1BQU0sRUFBRSxLQUFLLENBQUMsVUFBVSxDQUFDO0FBQ3ZEO0FBQ0E7QUFDQTtBQUNBO0FBQ08sTUFBTSxLQUFLLEdBQUc7QUFDckIsSUFBSSxHQUFHLEVBQUUsQ0FBQztBQUNWLElBQUksR0FBRyxDQUFDLEtBQUssRUFBRSxNQUFNLEVBQUU7QUFDdkIsUUFBUSxPQUFPLEVBQUUsQ0FBQyxLQUFLLENBQUMsQ0FBQyxRQUFRLENBQUMsTUFBTSxDQUFDO0FBQ3pDLEtBQUs7QUFDTCxJQUFJLEdBQUcsQ0FBQyxLQUFLLEVBQUUsTUFBTSxFQUFFLEtBQUssRUFBRTtBQUM5QixRQUFRLEVBQUUsQ0FBQyxLQUFLLENBQUMsQ0FBQyxRQUFRLENBQUMsTUFBTSxFQUFFLEtBQUssQ0FBQztBQUN6QyxRQUFRLE9BQU8sTUFBTSxHQUFHLENBQUM7QUFDekI7QUFDQSxDQUFDO0FBQ0Q7QUFDQTtBQUNBO0FBQ08sTUFBTSxTQUFTLEdBQUc7QUFDekIsSUFBSSxHQUFHLEVBQUUsQ0FBQztBQUNWLElBQUksR0FBRyxDQUFDLEtBQUssRUFBRSxNQUFNLEVBQUU7QUFDdkIsUUFBUSxPQUFPLEVBQUUsQ0FBQyxLQUFLLENBQUMsQ0FBQyxTQUFTLENBQUMsTUFBTSxFQUFFLElBQUksQ0FBQztBQUNoRCxLQUFLO0FBQ0wsSUFBSSxHQUFHLENBQUMsS0FBSyxFQUFFLE1BQU0sRUFBRSxLQUFLLEVBQUU7QUFDOUIsUUFBUSxFQUFFLENBQUMsS0FBSyxDQUFDLENBQUMsU0FBUyxDQUFDLE1BQU0sRUFBRSxLQUFLLEVBQUUsSUFBSSxDQUFDO0FBQ2hELFFBQVEsT0FBTyxNQUFNLEdBQUcsQ0FBQztBQUN6QjtBQUNBLENBQUM7QUFDRDtBQUNBO0FBQ0E7QUFDTyxNQUFNLFNBQVMsR0FBRztBQUN6QixJQUFJLEdBQUcsRUFBRSxDQUFDO0FBQ1YsSUFBSSxHQUFHLENBQUMsS0FBSyxFQUFFLE1BQU0sRUFBRTtBQUN2QixRQUFRLE9BQU8sRUFBRSxDQUFDLEtBQUssQ0FBQyxDQUFDLFNBQVMsQ0FBQyxNQUFNLENBQUM7QUFDMUMsS0FBSztBQUNMLElBQUksR0FBRyxDQUFDLEtBQUssRUFBRSxNQUFNLEVBQUUsS0FBSyxFQUFFO0FBQzlCLFFBQVEsRUFBRSxDQUFDLEtBQUssQ0FBQyxDQUFDLFNBQVMsQ0FBQyxNQUFNLEVBQUUsS0FBSyxDQUFDO0FBQzFDLFFBQVEsT0FBTyxNQUFNLEdBQUcsQ0FBQztBQUN6QjtBQUNBLENBQUM7QUFpQ0Q7QUFDQTtBQUNBO0FBQ08sTUFBTSxTQUFTLEdBQUc7QUFDekIsSUFBSSxHQUFHLEVBQUUsQ0FBQztBQUNWLElBQUksR0FBRyxDQUFDLEtBQUssRUFBRSxNQUFNLEVBQUU7QUFDdkIsUUFBUSxPQUFPLEVBQUUsQ0FBQyxLQUFLLENBQUMsQ0FBQyxTQUFTLENBQUMsTUFBTSxFQUFFLElBQUksQ0FBQztBQUNoRCxLQUFLO0FBQ0wsSUFBSSxHQUFHLENBQUMsS0FBSyxFQUFFLE1BQU0sRUFBRSxLQUFLLEVBQUU7QUFDOUIsUUFBUSxFQUFFLENBQUMsS0FBSyxDQUFDLENBQUMsU0FBUyxDQUFDLE1BQU0sRUFBRSxLQUFLLEVBQUUsSUFBSSxDQUFDO0FBQ2hELFFBQVEsT0FBTyxNQUFNLEdBQUcsQ0FBQztBQUN6QjtBQUNBLENBQUM7QUFDRDtBQUNBO0FBQ0E7QUFDTyxNQUFNLFNBQVMsR0FBRztBQUN6QixJQUFJLEdBQUcsRUFBRSxDQUFDO0FBQ1YsSUFBSSxHQUFHLENBQUMsS0FBSyxFQUFFLE1BQU0sRUFBRTtBQUN2QixRQUFRLE9BQU8sRUFBRSxDQUFDLEtBQUssQ0FBQyxDQUFDLFNBQVMsQ0FBQyxNQUFNLENBQUM7QUFDMUMsS0FBSztBQUNMLElBQUksR0FBRyxDQUFDLEtBQUssRUFBRSxNQUFNLEVBQUUsS0FBSyxFQUFFO0FBQzlCLFFBQVEsRUFBRSxDQUFDLEtBQUssQ0FBQyxDQUFDLFNBQVMsQ0FBQyxNQUFNLEVBQUUsS0FBSyxDQUFDO0FBQzFDLFFBQVEsT0FBTyxNQUFNLEdBQUcsQ0FBQztBQUN6QjtBQUNBLENBQUM7QUF3RUQ7QUFDQTtBQUNBO0FBQ08sTUFBTSxRQUFRLEdBQUc7QUFDeEIsSUFBSSxHQUFHLEVBQUUsQ0FBQztBQUNWLElBQUksR0FBRyxDQUFDLEtBQUssRUFBRSxNQUFNLEVBQUU7QUFDdkIsUUFBUSxPQUFPLEVBQUUsQ0FBQyxLQUFLLENBQUMsQ0FBQyxRQUFRLENBQUMsTUFBTSxDQUFDO0FBQ3pDLEtBQUs7QUFDTCxJQUFJLEdBQUcsQ0FBQyxLQUFLLEVBQUUsTUFBTSxFQUFFLEtBQUssRUFBRTtBQUM5QixRQUFRLEVBQUUsQ0FBQyxLQUFLLENBQUMsQ0FBQyxRQUFRLENBQUMsTUFBTSxFQUFFLEtBQUssQ0FBQztBQUN6QyxRQUFRLE9BQU8sTUFBTSxHQUFHLENBQUM7QUFDekI7QUFDQSxDQUFDO0FBY0Q7QUFDQTtBQUNBO0FBQ08sTUFBTSxTQUFTLEdBQUc7QUFDekIsSUFBSSxHQUFHLEVBQUUsQ0FBQztBQUNWLElBQUksR0FBRyxDQUFDLEtBQUssRUFBRSxNQUFNLEVBQUU7QUFDdkIsUUFBUSxPQUFPLEVBQUUsQ0FBQyxLQUFLLENBQUMsQ0FBQyxZQUFZLENBQUMsTUFBTSxFQUFFLElBQUksQ0FBQztBQUNuRCxLQUFLO0FBQ0wsSUFBSSxHQUFHLENBQUMsS0FBSyxFQUFFLE1BQU0sRUFBRSxLQUFLLEVBQUU7QUFDOUIsUUFBUSxFQUFFLENBQUMsS0FBSyxDQUFDLENBQUMsWUFBWSxDQUFDLE1BQU0sRUFBRSxLQUFLLEVBQUUsSUFBSSxDQUFDO0FBQ25ELFFBQVEsT0FBTyxNQUFNLEdBQUcsQ0FBQztBQUN6QjtBQUNBLENBQUM7QUErS0Q7QUFDQTtBQUNBO0FBQ08sTUFBTSxVQUFVLENBQUM7QUFDeEIsSUFBSSxXQUFXLENBQUMsR0FBRyxFQUFFLFFBQVEsRUFBRTtBQUMvQixRQUFRLElBQUksQ0FBQyxHQUFHLEdBQUcsR0FBRztBQUN0QixRQUFRLElBQUksQ0FBQyxRQUFRLEdBQUcsUUFBUTtBQUNoQztBQUNBLElBQUksR0FBRyxDQUFDLFVBQVUsRUFBRSxNQUFNLEVBQUU7QUFDNUIsUUFBUSxPQUFPQyxrQkFBTSxDQUFDLElBQUksQ0FBQyxVQUFVLENBQUMsQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLFFBQVEsRUFBRSxNQUFNLEVBQUUsTUFBTSxHQUFHLElBQUksQ0FBQyxHQUFHLENBQUM7QUFDekY7QUFDQTs7QUM5WU8sTUFBTSxlQUFlLEdBQUcsZUFBZTtBQUM5QztBQUNBO0FBQ0E7QUFDTyxNQUFNLGdCQUFnQixTQUFTLEtBQUssQ0FBQztBQUM1QyxJQUFJLFdBQVcsR0FBRztBQUNsQixRQUFRLEtBQUssQ0FBQyxlQUFlLENBQUM7QUFDOUI7QUFDQTs7QUNSTyxNQUFNLFFBQVEsQ0FBQztBQUN0QixJQUFJLFdBQVcsR0FBRztBQUNsQixRQUFRLElBQUksQ0FBQyxPQUFPLEdBQUcsTUFBTSxJQUFJO0FBQ2pDLFFBQVEsSUFBSSxDQUFDLE1BQU0sR0FBRyxNQUFNLElBQUk7QUFDaEMsUUFBUSxJQUFJLENBQUMsT0FBTyxHQUFHLElBQUksT0FBTyxDQUFDLENBQUMsT0FBTyxFQUFFLE1BQU0sS0FBSztBQUN4RCxZQUFZLElBQUksQ0FBQyxNQUFNLEdBQUcsTUFBTTtBQUNoQyxZQUFZLElBQUksQ0FBQyxPQUFPLEdBQUcsT0FBTztBQUNsQyxTQUFTLENBQUM7QUFDVjtBQUNBOztBQ1JPLE1BQU0sb0JBQW9CLENBQUM7QUFDbEMsSUFBSSxXQUFXLEdBQUc7QUFDbEI7QUFDQTtBQUNBO0FBQ0EsUUFBUSxJQUFJLENBQUMsaUJBQWlCLEdBQUcsQ0FBQyxHQUFHLElBQUksR0FBRyxJQUFJO0FBQ2hELFFBQVEsSUFBSSxDQUFDLFdBQVcsR0FBRyxLQUFLO0FBQ2hDO0FBQ0E7QUFDQTtBQUNBO0FBQ0EsUUFBUSxJQUFJLENBQUMsU0FBUyxHQUFHLEVBQUU7QUFDM0I7QUFDQSxJQUFJLE1BQU0sSUFBSSxDQUFDLFVBQVUsRUFBRSxNQUFNLEVBQUUsTUFBTSxFQUFFO0FBQzNDLFFBQVEsTUFBTSxTQUFTLEdBQUcsTUFBTSxJQUFJLENBQUMsSUFBSSxDQUFDLFVBQVUsRUFBRSxNQUFNLEVBQUUsTUFBTSxDQUFDO0FBQ3JFLFFBQVEsSUFBSSxDQUFDLFNBQVMsQ0FBQyxJQUFJLENBQUMsVUFBVSxDQUFDLFFBQVEsQ0FBQyxNQUFNLEVBQUUsTUFBTSxHQUFHLFNBQVMsQ0FBQyxDQUFDLENBQUM7QUFDN0UsUUFBUSxPQUFPLFNBQVM7QUFDeEI7QUFDQSxJQUFJLE1BQU0sSUFBSSxDQUFDLE1BQU0sRUFBRSxNQUFNLEVBQUUsTUFBTSxFQUFFO0FBQ3ZDLFFBQVEsSUFBSSxNQUFNLEtBQUssQ0FBQyxFQUFFO0FBQzFCLFlBQVksT0FBTyxDQUFDO0FBQ3BCO0FBQ0EsUUFBUSxJQUFJLFNBQVMsR0FBRyxJQUFJLENBQUMsa0JBQWtCLENBQUMsTUFBTSxFQUFFLE1BQU0sRUFBRSxNQUFNLENBQUM7QUFDdkUsUUFBUSxTQUFTLElBQUksTUFBTSxJQUFJLENBQUMsdUJBQXVCLENBQUMsTUFBTSxFQUFFLE1BQU0sR0FBRyxTQUFTLEVBQUUsTUFBTSxHQUFHLFNBQVMsQ0FBQztBQUN2RyxRQUFRLElBQUksU0FBUyxLQUFLLENBQUMsRUFBRTtBQUM3QixZQUFZLE1BQU0sSUFBSSxnQkFBZ0IsRUFBRTtBQUN4QztBQUNBLFFBQVEsT0FBTyxTQUFTO0FBQ3hCO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSxJQUFJLGtCQUFrQixDQUFDLE1BQU0sRUFBRSxNQUFNLEVBQUUsTUFBTSxFQUFFO0FBQy9DLFFBQVEsSUFBSSxTQUFTLEdBQUcsTUFBTTtBQUM5QixRQUFRLElBQUksU0FBUyxHQUFHLENBQUM7QUFDekI7QUFDQSxRQUFRLE9BQU8sSUFBSSxDQUFDLFNBQVMsQ0FBQyxNQUFNLEdBQUcsQ0FBQyxJQUFJLFNBQVMsR0FBRyxDQUFDLEVBQUU7QUFDM0QsWUFBWSxNQUFNLFFBQVEsR0FBRyxJQUFJLENBQUMsU0FBUyxDQUFDLEdBQUcsRUFBRSxDQUFDO0FBQ2xELFlBQVksSUFBSSxDQUFDLFFBQVE7QUFDekIsZ0JBQWdCLE1BQU0sSUFBSSxLQUFLLENBQUMsNEJBQTRCLENBQUM7QUFDN0QsWUFBWSxNQUFNLE9BQU8sR0FBRyxJQUFJLENBQUMsR0FBRyxDQUFDLFFBQVEsQ0FBQyxNQUFNLEVBQUUsU0FBUyxDQUFDO0FBQ2hFLFlBQVksTUFBTSxDQUFDLEdBQUcsQ0FBQyxRQUFRLENBQUMsUUFBUSxDQUFDLENBQUMsRUFBRSxPQUFPLENBQUMsRUFBRSxNQUFNLEdBQUcsU0FBUyxDQUFDO0FBQ3pFLFlBQVksU0FBUyxJQUFJLE9BQU87QUFDaEMsWUFBWSxTQUFTLElBQUksT0FBTztBQUNoQyxZQUFZLElBQUksT0FBTyxHQUFHLFFBQVEsQ0FBQyxNQUFNLEVBQUU7QUFDM0M7QUFDQSxnQkFBZ0IsSUFBSSxDQUFDLFNBQVMsQ0FBQyxJQUFJLENBQUMsUUFBUSxDQUFDLFFBQVEsQ0FBQyxPQUFPLENBQUMsQ0FBQztBQUMvRDtBQUNBO0FBQ0EsUUFBUSxPQUFPLFNBQVM7QUFDeEI7QUFDQSxJQUFJLE1BQU0sdUJBQXVCLENBQUMsTUFBTSxFQUFFLE1BQU0sRUFBRSxnQkFBZ0IsRUFBRTtBQUNwRSxRQUFRLElBQUksU0FBUyxHQUFHLGdCQUFnQjtBQUN4QyxRQUFRLElBQUksU0FBUyxHQUFHLENBQUM7QUFDekI7QUFDQSxRQUFRLE9BQU8sU0FBUyxHQUFHLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxXQUFXLEVBQUU7QUFDbkQsWUFBWSxNQUFNLE1BQU0sR0FBRyxJQUFJLENBQUMsR0FBRyxDQUFDLFNBQVMsRUFBRSxJQUFJLENBQUMsaUJBQWlCLENBQUM7QUFDdEUsWUFBWSxNQUFNLFFBQVEsR0FBRyxNQUFNLElBQUksQ0FBQyxjQUFjLENBQUMsTUFBTSxFQUFFLE1BQU0sR0FBRyxTQUFTLEVBQUUsTUFBTSxDQUFDO0FBQzFGLFlBQVksSUFBSSxRQUFRLEtBQUssQ0FBQztBQUM5QixnQkFBZ0I7QUFDaEIsWUFBWSxTQUFTLElBQUksUUFBUTtBQUNqQyxZQUFZLFNBQVMsSUFBSSxRQUFRO0FBQ2pDO0FBQ0EsUUFBUSxPQUFPLFNBQVM7QUFDeEI7QUFDQTs7QUNsRUE7QUFDQTtBQUNBO0FBQ0E7QUFDTyxNQUFNLFlBQVksU0FBUyxvQkFBb0IsQ0FBQztBQUN2RCxJQUFJLFdBQVcsQ0FBQyxDQUFDLEVBQUU7QUFDbkIsUUFBUSxLQUFLLEVBQUU7QUFDZixRQUFRLElBQUksQ0FBQyxDQUFDLEdBQUcsQ0FBQztBQUNsQjtBQUNBO0FBQ0E7QUFDQSxRQUFRLElBQUksQ0FBQyxRQUFRLEdBQUcsSUFBSTtBQUM1QixRQUFRLElBQUksQ0FBQyxDQUFDLENBQUMsSUFBSSxJQUFJLENBQUMsQ0FBQyxDQUFDLElBQUksRUFBRTtBQUNoQyxZQUFZLE1BQU0sSUFBSSxLQUFLLENBQUMseUNBQXlDLENBQUM7QUFDdEU7QUFDQSxRQUFRLElBQUksQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLEtBQUssRUFBRSxNQUFNLElBQUksQ0FBQyxNQUFNLENBQUMsSUFBSSxnQkFBZ0IsRUFBRSxDQUFDLENBQUM7QUFDckUsUUFBUSxJQUFJLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxPQUFPLEVBQUUsR0FBRyxJQUFJLElBQUksQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLENBQUM7QUFDckQsUUFBUSxJQUFJLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxPQUFPLEVBQUUsTUFBTSxJQUFJLENBQUMsTUFBTSxDQUFDLElBQUksS0FBSyxDQUFDLGVBQWUsQ0FBQyxDQUFDLENBQUM7QUFDM0U7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBLElBQUksTUFBTSxjQUFjLENBQUMsTUFBTSxFQUFFLE1BQU0sRUFBRSxNQUFNLEVBQUU7QUFDakQsUUFBUSxJQUFJLElBQUksQ0FBQyxXQUFXLEVBQUU7QUFDOUIsWUFBWSxPQUFPLENBQUM7QUFDcEI7QUFDQSxRQUFRLE1BQU0sVUFBVSxHQUFHLElBQUksQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQztBQUM5QyxRQUFRLElBQUksVUFBVSxFQUFFO0FBQ3hCLFlBQVksTUFBTSxDQUFDLEdBQUcsQ0FBQyxVQUFVLEVBQUUsTUFBTSxDQUFDO0FBQzFDLFlBQVksT0FBTyxVQUFVLENBQUMsTUFBTTtBQUNwQztBQUNBLFFBQVEsTUFBTSxPQUFPLEdBQUc7QUFDeEIsWUFBWSxNQUFNO0FBQ2xCLFlBQVksTUFBTTtBQUNsQixZQUFZLE1BQU07QUFDbEIsWUFBWSxRQUFRLEVBQUUsSUFBSSxRQUFRO0FBQ2xDLFNBQVM7QUFDVCxRQUFRLElBQUksQ0FBQyxRQUFRLEdBQUcsT0FBTyxDQUFDLFFBQVE7QUFDeEMsUUFBUSxJQUFJLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxVQUFVLEVBQUUsTUFBTTtBQUN0QyxZQUFZLElBQUksQ0FBQyxZQUFZLENBQUMsT0FBTyxDQUFDO0FBQ3RDLFNBQVMsQ0FBQztBQUNWLFFBQVEsT0FBTyxPQUFPLENBQUMsUUFBUSxDQUFDLE9BQU87QUFDdkM7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBLElBQUksWUFBWSxDQUFDLE9BQU8sRUFBRTtBQUMxQixRQUFRLE1BQU0sVUFBVSxHQUFHLElBQUksQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxNQUFNLENBQUM7QUFDdEQsUUFBUSxJQUFJLFVBQVUsRUFBRTtBQUN4QixZQUFZLE9BQU8sQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLFVBQVUsRUFBRSxPQUFPLENBQUMsTUFBTSxDQUFDO0FBQzFELFlBQVksT0FBTyxDQUFDLFFBQVEsQ0FBQyxPQUFPLENBQUMsVUFBVSxDQUFDLE1BQU0sQ0FBQztBQUN2RCxZQUFZLElBQUksQ0FBQyxRQUFRLEdBQUcsSUFBSTtBQUNoQztBQUNBLGFBQWE7QUFDYixZQUFZLElBQUksQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLFVBQVUsRUFBRSxNQUFNO0FBQzFDLGdCQUFnQixJQUFJLENBQUMsWUFBWSxDQUFDLE9BQU8sQ0FBQztBQUMxQyxhQUFhLENBQUM7QUFDZDtBQUNBO0FBQ0EsSUFBSSxNQUFNLENBQUMsR0FBRyxFQUFFO0FBQ2hCLFFBQVEsSUFBSSxDQUFDLFdBQVcsR0FBRyxJQUFJO0FBQy9CLFFBQVEsSUFBSSxJQUFJLENBQUMsUUFBUSxFQUFFO0FBQzNCLFlBQVksSUFBSSxDQUFDLFFBQVEsQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDO0FBQ3JDLFlBQVksSUFBSSxDQUFDLFFBQVEsR0FBRyxJQUFJO0FBQ2hDO0FBQ0E7QUFDQSxJQUFJLE1BQU0sS0FBSyxHQUFHO0FBQ2xCLFFBQVEsSUFBSSxDQUFDLENBQUMsQ0FBQyxPQUFPLEVBQUU7QUFDeEI7QUFDQTs7QUM3RUE7QUFDQTtBQUNBO0FBQ08sTUFBTSxpQkFBaUIsQ0FBQztBQUMvQixJQUFJLFdBQVcsQ0FBQyxRQUFRLEVBQUU7QUFDMUI7QUFDQTtBQUNBO0FBQ0EsUUFBUSxJQUFJLENBQUMsUUFBUSxHQUFHLENBQUM7QUFDekIsUUFBUSxJQUFJLENBQUMsU0FBUyxHQUFHLElBQUksVUFBVSxDQUFDLENBQUMsQ0FBQztBQUMxQyxRQUFRLElBQUksQ0FBQyxRQUFRLEdBQUcsUUFBUSxHQUFHLFFBQVEsR0FBRyxFQUFFO0FBQ2hEO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EsSUFBSSxNQUFNLFNBQVMsQ0FBQyxLQUFLLEVBQUUsUUFBUSxHQUFHLElBQUksQ0FBQyxRQUFRLEVBQUU7QUFDckQsUUFBUSxNQUFNLFVBQVUsR0FBRyxJQUFJLFVBQVUsQ0FBQyxLQUFLLENBQUMsR0FBRyxDQUFDO0FBQ3BELFFBQVEsTUFBTSxHQUFHLEdBQUcsTUFBTSxJQUFJLENBQUMsVUFBVSxDQUFDLFVBQVUsRUFBRSxFQUFFLFFBQVEsRUFBRSxDQUFDO0FBQ25FLFFBQVEsSUFBSSxHQUFHLEdBQUcsS0FBSyxDQUFDLEdBQUc7QUFDM0IsWUFBWSxNQUFNLElBQUksZ0JBQWdCLEVBQUU7QUFDeEMsUUFBUSxPQUFPLEtBQUssQ0FBQyxHQUFHLENBQUMsVUFBVSxFQUFFLENBQUMsQ0FBQztBQUN2QztBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBLElBQUksTUFBTSxTQUFTLENBQUMsS0FBSyxFQUFFLFFBQVEsR0FBRyxJQUFJLENBQUMsUUFBUSxFQUFFO0FBQ3JELFFBQVEsTUFBTSxVQUFVLEdBQUcsSUFBSSxVQUFVLENBQUMsS0FBSyxDQUFDLEdBQUcsQ0FBQztBQUNwRCxRQUFRLE1BQU0sR0FBRyxHQUFHLE1BQU0sSUFBSSxDQUFDLFVBQVUsQ0FBQyxVQUFVLEVBQUUsRUFBRSxRQUFRLEVBQUUsQ0FBQztBQUNuRSxRQUFRLElBQUksR0FBRyxHQUFHLEtBQUssQ0FBQyxHQUFHO0FBQzNCLFlBQVksTUFBTSxJQUFJLGdCQUFnQixFQUFFO0FBQ3hDLFFBQVEsT0FBTyxLQUFLLENBQUMsR0FBRyxDQUFDLFVBQVUsRUFBRSxDQUFDLENBQUM7QUFDdkM7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EsSUFBSSxNQUFNLFVBQVUsQ0FBQyxLQUFLLEVBQUU7QUFDNUIsUUFBUSxNQUFNLEdBQUcsR0FBRyxNQUFNLElBQUksQ0FBQyxVQUFVLENBQUMsSUFBSSxDQUFDLFNBQVMsRUFBRSxFQUFFLE1BQU0sRUFBRSxLQUFLLENBQUMsR0FBRyxFQUFFLENBQUM7QUFDaEYsUUFBUSxJQUFJLEdBQUcsR0FBRyxLQUFLLENBQUMsR0FBRztBQUMzQixZQUFZLE1BQU0sSUFBSSxnQkFBZ0IsRUFBRTtBQUN4QyxRQUFRLE9BQU8sS0FBSyxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsU0FBUyxFQUFFLENBQUMsQ0FBQztBQUMzQztBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSxJQUFJLE1BQU0sVUFBVSxDQUFDLEtBQUssRUFBRTtBQUM1QixRQUFRLE1BQU0sR0FBRyxHQUFHLE1BQU0sSUFBSSxDQUFDLFVBQVUsQ0FBQyxJQUFJLENBQUMsU0FBUyxFQUFFLEVBQUUsTUFBTSxFQUFFLEtBQUssQ0FBQyxHQUFHLEVBQUUsQ0FBQztBQUNoRixRQUFRLElBQUksR0FBRyxHQUFHLEtBQUssQ0FBQyxHQUFHO0FBQzNCLFlBQVksTUFBTSxJQUFJLGdCQUFnQixFQUFFO0FBQ3hDLFFBQVEsT0FBTyxLQUFLLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxTQUFTLEVBQUUsQ0FBQyxDQUFDO0FBQzNDO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBLElBQUksTUFBTSxNQUFNLENBQUMsTUFBTSxFQUFFO0FBQ3pCLFFBQVEsSUFBSSxJQUFJLENBQUMsUUFBUSxDQUFDLElBQUksS0FBSyxTQUFTLEVBQUU7QUFDOUMsWUFBWSxNQUFNLFNBQVMsR0FBRyxJQUFJLENBQUMsUUFBUSxDQUFDLElBQUksR0FBRyxJQUFJLENBQUMsUUFBUTtBQUNoRSxZQUFZLElBQUksTUFBTSxHQUFHLFNBQVMsRUFBRTtBQUNwQyxnQkFBZ0IsSUFBSSxDQUFDLFFBQVEsSUFBSSxTQUFTO0FBQzFDLGdCQUFnQixPQUFPLFNBQVM7QUFDaEM7QUFDQTtBQUNBLFFBQVEsSUFBSSxDQUFDLFFBQVEsSUFBSSxNQUFNO0FBQy9CLFFBQVEsT0FBTyxNQUFNO0FBQ3JCO0FBQ0EsSUFBSSxNQUFNLEtBQUssR0FBRztBQUNsQjtBQUNBO0FBQ0EsSUFBSSxnQkFBZ0IsQ0FBQyxVQUFVLEVBQUUsT0FBTyxFQUFFO0FBQzFDLFFBQVEsSUFBSSxPQUFPLElBQUksT0FBTyxDQUFDLFFBQVEsS0FBSyxTQUFTLElBQUksT0FBTyxDQUFDLFFBQVEsR0FBRyxJQUFJLENBQUMsUUFBUSxFQUFFO0FBQzNGLFlBQVksTUFBTSxJQUFJLEtBQUssQ0FBQyx1RUFBdUUsQ0FBQztBQUNwRztBQUNBLFFBQVEsSUFBSSxPQUFPLEVBQUU7QUFDckIsWUFBWSxPQUFPO0FBQ25CLGdCQUFnQixTQUFTLEVBQUUsT0FBTyxDQUFDLFNBQVMsS0FBSyxJQUFJO0FBQ3JELGdCQUFnQixNQUFNLEVBQUUsT0FBTyxDQUFDLE1BQU0sR0FBRyxPQUFPLENBQUMsTUFBTSxHQUFHLENBQUM7QUFDM0QsZ0JBQWdCLE1BQU0sRUFBRSxPQUFPLENBQUMsTUFBTSxHQUFHLE9BQU8sQ0FBQyxNQUFNLElBQUksVUFBVSxDQUFDLE1BQU0sSUFBSSxPQUFPLENBQUMsTUFBTSxHQUFHLE9BQU8sQ0FBQyxNQUFNLEdBQUcsQ0FBQyxDQUFDLENBQUM7QUFDckgsZ0JBQWdCLFFBQVEsRUFBRSxPQUFPLENBQUMsUUFBUSxHQUFHLE9BQU8sQ0FBQyxRQUFRLEdBQUcsSUFBSSxDQUFDO0FBQ3JFLGFBQWE7QUFDYjtBQUNBLFFBQVEsT0FBTztBQUNmLFlBQVksU0FBUyxFQUFFLEtBQUs7QUFDNUIsWUFBWSxNQUFNLEVBQUUsQ0FBQztBQUNyQixZQUFZLE1BQU0sRUFBRSxVQUFVLENBQUMsTUFBTTtBQUNyQyxZQUFZLFFBQVEsRUFBRSxJQUFJLENBQUM7QUFDM0IsU0FBUztBQUNUO0FBQ0E7O0FDakdBLE1BQU0sYUFBYSxHQUFHLE1BQU07QUFDckIsTUFBTSxtQkFBbUIsU0FBUyxpQkFBaUIsQ0FBQztBQUMzRCxJQUFJLFdBQVcsQ0FBQyxZQUFZLEVBQUUsUUFBUSxFQUFFO0FBQ3hDLFFBQVEsS0FBSyxDQUFDLFFBQVEsQ0FBQztBQUN2QixRQUFRLElBQUksQ0FBQyxZQUFZLEdBQUcsWUFBWTtBQUN4QztBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EsSUFBSSxNQUFNLFdBQVcsR0FBRztBQUN4QixRQUFRLE9BQU8sSUFBSSxDQUFDLFFBQVE7QUFDNUI7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSxJQUFJLE1BQU0sVUFBVSxDQUFDLFVBQVUsRUFBRSxPQUFPLEVBQUU7QUFDMUMsUUFBUSxNQUFNLFdBQVcsR0FBRyxJQUFJLENBQUMsZ0JBQWdCLENBQUMsVUFBVSxFQUFFLE9BQU8sQ0FBQztBQUN0RSxRQUFRLE1BQU0sU0FBUyxHQUFHLFdBQVcsQ0FBQyxRQUFRLEdBQUcsSUFBSSxDQUFDLFFBQVE7QUFDOUQsUUFBUSxJQUFJLFNBQVMsR0FBRyxDQUFDLEVBQUU7QUFDM0IsWUFBWSxNQUFNLElBQUksQ0FBQyxNQUFNLENBQUMsU0FBUyxDQUFDO0FBQ3hDLFlBQVksT0FBTyxJQUFJLENBQUMsVUFBVSxDQUFDLFVBQVUsRUFBRSxPQUFPLENBQUM7QUFDdkQ7QUFDQSxhQUFhLElBQUksU0FBUyxHQUFHLENBQUMsRUFBRTtBQUNoQyxZQUFZLE1BQU0sSUFBSSxLQUFLLENBQUMsdUVBQXVFLENBQUM7QUFDcEc7QUFDQSxRQUFRLElBQUksV0FBVyxDQUFDLE1BQU0sS0FBSyxDQUFDLEVBQUU7QUFDdEMsWUFBWSxPQUFPLENBQUM7QUFDcEI7QUFDQSxRQUFRLE1BQU0sU0FBUyxHQUFHLE1BQU0sSUFBSSxDQUFDLFlBQVksQ0FBQyxJQUFJLENBQUMsVUFBVSxFQUFFLFdBQVcsQ0FBQyxNQUFNLEVBQUUsV0FBVyxDQUFDLE1BQU0sQ0FBQztBQUMxRyxRQUFRLElBQUksQ0FBQyxRQUFRLElBQUksU0FBUztBQUNsQyxRQUFRLElBQUksQ0FBQyxDQUFDLE9BQU8sSUFBSSxDQUFDLE9BQU8sQ0FBQyxTQUFTLEtBQUssU0FBUyxHQUFHLFdBQVcsQ0FBQyxNQUFNLEVBQUU7QUFDaEYsWUFBWSxNQUFNLElBQUksZ0JBQWdCLEVBQUU7QUFDeEM7QUFDQSxRQUFRLE9BQU8sU0FBUztBQUN4QjtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBLElBQUksTUFBTSxVQUFVLENBQUMsVUFBVSxFQUFFLE9BQU8sRUFBRTtBQUMxQyxRQUFRLE1BQU0sV0FBVyxHQUFHLElBQUksQ0FBQyxnQkFBZ0IsQ0FBQyxVQUFVLEVBQUUsT0FBTyxDQUFDO0FBQ3RFLFFBQVEsSUFBSSxTQUFTLEdBQUcsQ0FBQztBQUN6QixRQUFRLElBQUksV0FBVyxDQUFDLFFBQVEsRUFBRTtBQUNsQyxZQUFZLE1BQU0sU0FBUyxHQUFHLFdBQVcsQ0FBQyxRQUFRLEdBQUcsSUFBSSxDQUFDLFFBQVE7QUFDbEUsWUFBWSxJQUFJLFNBQVMsR0FBRyxDQUFDLEVBQUU7QUFDL0IsZ0JBQWdCLE1BQU0sVUFBVSxHQUFHLElBQUksVUFBVSxDQUFDLFdBQVcsQ0FBQyxNQUFNLEdBQUcsU0FBUyxDQUFDO0FBQ2pGLGdCQUFnQixTQUFTLEdBQUcsTUFBTSxJQUFJLENBQUMsVUFBVSxDQUFDLFVBQVUsRUFBRSxFQUFFLFNBQVMsRUFBRSxXQUFXLENBQUMsU0FBUyxFQUFFLENBQUM7QUFDbkcsZ0JBQWdCLFVBQVUsQ0FBQyxHQUFHLENBQUMsVUFBVSxDQUFDLFFBQVEsQ0FBQyxTQUFTLENBQUMsRUFBRSxXQUFXLENBQUMsTUFBTSxDQUFDO0FBQ2xGLGdCQUFnQixPQUFPLFNBQVMsR0FBRyxTQUFTO0FBQzVDO0FBQ0EsaUJBQWlCLElBQUksU0FBUyxHQUFHLENBQUMsRUFBRTtBQUNwQyxnQkFBZ0IsTUFBTSxJQUFJLEtBQUssQ0FBQyxnREFBZ0QsQ0FBQztBQUNqRjtBQUNBO0FBQ0EsUUFBUSxJQUFJLFdBQVcsQ0FBQyxNQUFNLEdBQUcsQ0FBQyxFQUFFO0FBQ3BDLFlBQVksSUFBSTtBQUNoQixnQkFBZ0IsU0FBUyxHQUFHLE1BQU0sSUFBSSxDQUFDLFlBQVksQ0FBQyxJQUFJLENBQUMsVUFBVSxFQUFFLFdBQVcsQ0FBQyxNQUFNLEVBQUUsV0FBVyxDQUFDLE1BQU0sQ0FBQztBQUM1RztBQUNBLFlBQVksT0FBTyxHQUFHLEVBQUU7QUFDeEIsZ0JBQWdCLElBQUksT0FBTyxJQUFJLE9BQU8sQ0FBQyxTQUFTLElBQUksR0FBRyxZQUFZLGdCQUFnQixFQUFFO0FBQ3JGLG9CQUFvQixPQUFPLENBQUM7QUFDNUI7QUFDQSxnQkFBZ0IsTUFBTSxHQUFHO0FBQ3pCO0FBQ0EsWUFBWSxJQUFJLENBQUMsQ0FBQyxXQUFXLENBQUMsU0FBUyxLQUFLLFNBQVMsR0FBRyxXQUFXLENBQUMsTUFBTSxFQUFFO0FBQzVFLGdCQUFnQixNQUFNLElBQUksZ0JBQWdCLEVBQUU7QUFDNUM7QUFDQTtBQUNBLFFBQVEsT0FBTyxTQUFTO0FBQ3hCO0FBQ0EsSUFBSSxNQUFNLE1BQU0sQ0FBQyxNQUFNLEVBQUU7QUFDekI7QUFDQSxRQUFRLE1BQU0sT0FBTyxHQUFHLElBQUksQ0FBQyxHQUFHLENBQUMsYUFBYSxFQUFFLE1BQU0sQ0FBQztBQUN2RCxRQUFRLE1BQU0sR0FBRyxHQUFHLElBQUksVUFBVSxDQUFDLE9BQU8sQ0FBQztBQUMzQyxRQUFRLElBQUksWUFBWSxHQUFHLENBQUM7QUFDNUIsUUFBUSxPQUFPLFlBQVksR0FBRyxNQUFNLEVBQUU7QUFDdEMsWUFBWSxNQUFNLFNBQVMsR0FBRyxNQUFNLEdBQUcsWUFBWTtBQUNuRCxZQUFZLE1BQU0sU0FBUyxHQUFHLE1BQU0sSUFBSSxDQUFDLFVBQVUsQ0FBQyxHQUFHLEVBQUUsRUFBRSxNQUFNLEVBQUUsSUFBSSxDQUFDLEdBQUcsQ0FBQyxPQUFPLEVBQUUsU0FBUyxDQUFDLEVBQUUsQ0FBQztBQUNsRyxZQUFZLElBQUksU0FBUyxHQUFHLENBQUMsRUFBRTtBQUMvQixnQkFBZ0IsT0FBTyxTQUFTO0FBQ2hDO0FBQ0EsWUFBWSxZQUFZLElBQUksU0FBUztBQUNyQztBQUNBLFFBQVEsT0FBTyxZQUFZO0FBQzNCO0FBQ0E7O0FDM0ZPLE1BQU0sZUFBZSxTQUFTLGlCQUFpQixDQUFDO0FBQ3ZEO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSxJQUFJLFdBQVcsQ0FBQyxVQUFVLEVBQUUsUUFBUSxFQUFFO0FBQ3RDLFFBQVEsS0FBSyxDQUFDLFFBQVEsQ0FBQztBQUN2QixRQUFRLElBQUksQ0FBQyxVQUFVLEdBQUcsVUFBVTtBQUNwQyxRQUFRLElBQUksQ0FBQyxRQUFRLENBQUMsSUFBSSxHQUFHLElBQUksQ0FBQyxRQUFRLENBQUMsSUFBSSxHQUFHLElBQUksQ0FBQyxRQUFRLENBQUMsSUFBSSxHQUFHLFVBQVUsQ0FBQyxNQUFNO0FBQ3hGO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EsSUFBSSxNQUFNLFVBQVUsQ0FBQyxVQUFVLEVBQUUsT0FBTyxFQUFFO0FBQzFDLFFBQVEsSUFBSSxPQUFPLElBQUksT0FBTyxDQUFDLFFBQVEsRUFBRTtBQUN6QyxZQUFZLElBQUksT0FBTyxDQUFDLFFBQVEsR0FBRyxJQUFJLENBQUMsUUFBUSxFQUFFO0FBQ2xELGdCQUFnQixNQUFNLElBQUksS0FBSyxDQUFDLHVFQUF1RSxDQUFDO0FBQ3hHO0FBQ0EsWUFBWSxJQUFJLENBQUMsUUFBUSxHQUFHLE9BQU8sQ0FBQyxRQUFRO0FBQzVDO0FBQ0EsUUFBUSxNQUFNLFNBQVMsR0FBRyxNQUFNLElBQUksQ0FBQyxVQUFVLENBQUMsVUFBVSxFQUFFLE9BQU8sQ0FBQztBQUNwRSxRQUFRLElBQUksQ0FBQyxRQUFRLElBQUksU0FBUztBQUNsQyxRQUFRLE9BQU8sU0FBUztBQUN4QjtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBLElBQUksTUFBTSxVQUFVLENBQUMsVUFBVSxFQUFFLE9BQU8sRUFBRTtBQUMxQyxRQUFRLE1BQU0sV0FBVyxHQUFHLElBQUksQ0FBQyxnQkFBZ0IsQ0FBQyxVQUFVLEVBQUUsT0FBTyxDQUFDO0FBQ3RFLFFBQVEsTUFBTSxVQUFVLEdBQUcsSUFBSSxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsVUFBVSxDQUFDLE1BQU0sR0FBRyxXQUFXLENBQUMsUUFBUSxFQUFFLFdBQVcsQ0FBQyxNQUFNLENBQUM7QUFDdEcsUUFBUSxJQUFJLENBQUMsQ0FBQyxXQUFXLENBQUMsU0FBUyxLQUFLLFVBQVUsR0FBRyxXQUFXLENBQUMsTUFBTSxFQUFFO0FBQ3pFLFlBQVksTUFBTSxJQUFJLGdCQUFnQixFQUFFO0FBQ3hDO0FBQ0EsYUFBYTtBQUNiLFlBQVksVUFBVSxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsVUFBVSxDQUFDLFFBQVEsQ0FBQyxXQUFXLENBQUMsUUFBUSxFQUFFLFdBQVcsQ0FBQyxRQUFRLEdBQUcsVUFBVSxDQUFDLEVBQUUsV0FBVyxDQUFDLE1BQU0sQ0FBQztBQUNqSSxZQUFZLE9BQU8sVUFBVTtBQUM3QjtBQUNBO0FBQ0EsSUFBSSxNQUFNLEtBQUssR0FBRztBQUNsQjtBQUNBO0FBQ0E7O0FDOUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ08sU0FBUyxVQUFVLENBQUMsTUFBTSxFQUFFLFFBQVEsRUFBRTtBQUM3QyxJQUFJLFFBQVEsR0FBRyxRQUFRLEdBQUcsUUFBUSxHQUFHLEVBQUU7QUFDdkMsSUFBSSxPQUFPLElBQUksbUJBQW1CLENBQUMsSUFBSSxZQUFZLENBQUMsTUFBTSxDQUFDLEVBQUUsUUFBUSxDQUFDO0FBQ3RFO0FBWUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ08sU0FBUyxVQUFVLENBQUMsVUFBVSxFQUFFLFFBQVEsRUFBRTtBQUNqRCxJQUFJLE9BQU8sSUFBSSxlQUFlLENBQUMsVUFBVSxFQUFFLFFBQVEsQ0FBQztBQUNwRDs7QUNsQ08sU0FBUyxhQUFhLENBQUMsTUFBTSxFQUFFO0FBQ3RDLENBQUMsT0FBTyxDQUFDLEdBQUcsTUFBTSxDQUFDLENBQUMsR0FBRyxDQUFDLFNBQVMsSUFBSSxTQUFTLENBQUMsVUFBVSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7QUFDOUQ7O0FBRUE7QUFDQTs7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNPLFNBQVMsd0JBQXdCLENBQUMsTUFBTSxFQUFFLE1BQU0sR0FBRyxDQUFDLEVBQUU7QUFDN0QsQ0FBQyxNQUFNLE9BQU8sR0FBRyxNQUFNLENBQUMsUUFBUSxDQUFDLE1BQU0sQ0FBQyxRQUFRLENBQUMsTUFBTSxFQUFFLEdBQUcsRUFBRSxHQUFHLENBQUMsQ0FBQyxPQUFPLENBQUMsT0FBTyxFQUFFLEVBQUUsQ0FBQyxDQUFDLElBQUksRUFBRSxFQUFFLENBQUMsQ0FBQyxDQUFDO0FBQ25HLENBQUMsSUFBSSxNQUFNLENBQUMsS0FBSyxDQUFDLE9BQU8sQ0FBQyxFQUFFO0FBQzVCLEVBQUUsT0FBTyxLQUFLO0FBQ2Q7O0FBRUEsQ0FBQyxJQUFJLEdBQUcsR0FBRyxDQUFDLEdBQUcsSUFBSSxDQUFDOztBQUVwQixDQUFDLEtBQUssSUFBSSxLQUFLLEdBQUcsTUFBTSxFQUFFLEtBQUssR0FBRyxNQUFNLEdBQUcsR0FBRyxFQUFFLEtBQUssRUFBRSxFQUFFO0FBQ3pELEVBQUUsR0FBRyxJQUFJLE1BQU0sQ0FBQyxLQUFLLENBQUM7QUFDdEI7O0FBRUEsQ0FBQyxLQUFLLElBQUksS0FBSyxHQUFHLE1BQU0sR0FBRyxHQUFHLEVBQUUsS0FBSyxHQUFHLE1BQU0sR0FBRyxHQUFHLEVBQUUsS0FBSyxFQUFFLEVBQUU7QUFDL0QsRUFBRSxHQUFHLElBQUksTUFBTSxDQUFDLEtBQUssQ0FBQztBQUN0Qjs7QUFFQSxDQUFDLE9BQU8sT0FBTyxLQUFLLEdBQUc7QUFDdkI7O0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFDTyxNQUFNLG1CQUFtQixHQUFHO0FBQ25DLENBQUMsR0FBRyxFQUFFLENBQUMsTUFBTSxFQUFFLE1BQU0sS0FBSyxDQUFDLE1BQU0sQ0FBQyxNQUFNLEdBQUcsQ0FBQyxDQUFDLEdBQUcsSUFBSSxLQUFLLENBQUMsTUFBTSxDQUFDLE1BQU0sR0FBRyxDQUFDLENBQUMsS0FBSyxDQUFDLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxNQUFNLEdBQUcsQ0FBQyxDQUFDLEtBQUssRUFBRSxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsTUFBTSxDQUFDLEtBQUssRUFBRSxDQUFDO0FBQzdJLENBQUMsR0FBRyxFQUFFLENBQUM7QUFDUCxDQUFDOztBQ3JDTSxNQUFNLFVBQVUsR0FBRztBQUMxQixDQUFDLEtBQUs7QUFDTixDQUFDLEtBQUs7QUFDTixDQUFDLE1BQU07QUFDUCxDQUFDLEtBQUs7QUFDTixDQUFDLE1BQU07QUFDUCxDQUFDLE1BQU07QUFDUCxDQUFDLEtBQUs7QUFDTixDQUFDLEtBQUs7QUFDTixDQUFDLEtBQUs7QUFDTixDQUFDLEtBQUs7QUFDTixDQUFDLEtBQUs7QUFDTixDQUFDLEtBQUs7QUFDTixDQUFDLEtBQUs7QUFDTixDQUFDLEtBQUs7QUFDTixDQUFDLEtBQUs7QUFDTixDQUFDLEtBQUs7QUFDTixDQUFDLEtBQUs7QUFDTixDQUFDLE1BQU07QUFDUCxDQUFDLEtBQUs7QUFDTixDQUFDLEtBQUs7QUFDTixDQUFDLE1BQU07QUFDUCxDQUFDLEtBQUs7QUFDTixDQUFDLEtBQUs7QUFDTixDQUFDLEtBQUs7QUFDTixDQUFDLElBQUk7QUFDTCxDQUFDLEtBQUs7QUFDTixDQUFDLElBQUk7QUFDTCxDQUFDLEtBQUs7QUFDTixDQUFDLEtBQUs7QUFDTixDQUFDLEtBQUs7QUFDTixDQUFDLEtBQUs7QUFDTixDQUFDLE1BQU07QUFDUCxDQUFDLEtBQUs7QUFDTixDQUFDLEtBQUs7QUFDTixDQUFDLEtBQUs7QUFDTixDQUFDLEtBQUs7QUFDTixDQUFDLEtBQUs7QUFDTixDQUFDLEtBQUs7QUFDTixDQUFDLEtBQUs7QUFDTixDQUFDLEtBQUs7QUFDTixDQUFDLEtBQUs7QUFDTixDQUFDLE1BQU07QUFDUCxDQUFDLE1BQU07QUFDUCxDQUFDLEtBQUs7QUFDTixDQUFDLEtBQUs7QUFDTixDQUFDLEtBQUs7QUFDTixDQUFDLEtBQUs7QUFDTixDQUFDLE1BQU07QUFDUCxDQUFDLEtBQUs7QUFDTixDQUFDLE9BQU87QUFDUixDQUFDLEtBQUs7QUFDTixDQUFDLEtBQUs7QUFDTixDQUFDLEtBQUs7QUFDTixDQUFDLE1BQU07QUFDUCxDQUFDLE1BQU07QUFDUCxDQUFDLE9BQU87QUFDUixDQUFDLEtBQUs7QUFDTixDQUFDLEtBQUs7QUFDTixDQUFDLEtBQUs7QUFDTixDQUFDLEtBQUs7QUFDTixDQUFDLEtBQUs7QUFDTixDQUFDLElBQUk7QUFDTCxDQUFDLElBQUk7QUFDTCxDQUFDLFFBQVE7QUFDVCxDQUFDLEtBQUs7QUFDTixDQUFDLEtBQUs7QUFDTixDQUFDLEtBQUs7QUFDTixDQUFDLEtBQUs7QUFDTixDQUFDLEtBQUs7QUFDTixDQUFDLElBQUk7QUFDTCxDQUFDLEtBQUs7QUFDTixDQUFDLEdBQUc7QUFDSixDQUFDLElBQUk7QUFDTCxDQUFDLEtBQUs7QUFDTixDQUFDLEtBQUs7QUFDTixDQUFDLEtBQUs7QUFDTixDQUFDLE9BQU87QUFDUixDQUFDLEtBQUs7QUFDTixDQUFDLE1BQU07QUFDUCxDQUFDLE1BQU07QUFDUCxDQUFDLE1BQU07QUFDUCxDQUFDLEtBQUs7QUFDTixDQUFDLEtBQUs7QUFDTixDQUFDLEtBQUs7QUFDTixDQUFDLEtBQUs7QUFDTixDQUFDLEtBQUs7QUFDTixDQUFDLEtBQUs7QUFDTixDQUFDLEtBQUs7QUFDTixDQUFDLEtBQUs7QUFDTixDQUFDLEtBQUs7QUFDTixDQUFDLEtBQUs7QUFDTixDQUFDLEtBQUs7QUFDTixDQUFDLEtBQUs7QUFDTixDQUFDLEtBQUs7QUFDTixDQUFDLE1BQU07QUFDUCxDQUFDLE1BQU07QUFDUCxDQUFDLEtBQUs7QUFDTixDQUFDLEtBQUs7QUFDTixDQUFDLEtBQUs7QUFDTixDQUFDLElBQUk7QUFDTCxDQUFDLEtBQUs7QUFDTixDQUFDLEtBQUs7QUFDTixDQUFDLEtBQUs7QUFDTixDQUFDLE1BQU07QUFDUCxDQUFDLEtBQUs7QUFDTixDQUFDLEtBQUs7QUFDTixDQUFDLE9BQU87QUFDUixDQUFDLEtBQUs7QUFDTixDQUFDLEtBQUs7QUFDTixDQUFDLEtBQUs7QUFDTixDQUFDLEtBQUs7QUFDTixDQUFDLEtBQUs7QUFDTixDQUFDLEtBQUs7QUFDTixDQUFDLEtBQUs7QUFDTixDQUFDLEtBQUs7QUFDTixDQUFDLEtBQUs7QUFDTixDQUFDLEtBQUs7QUFDTixDQUFDLEtB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QUFFLENBQUMsQ0FBQztBQUN4QyxNQUFNLElBQUksQ0FBQyxXQUFXLENBQUMsT0FBTyxFQUFFLENBQUMsTUFBTSxFQUFFLENBQUMsQ0FBQztBQUMzQyxNQUFNLElBQUksQ0FBQyxXQUFXLENBQUMsT0FBTyxFQUFFLENBQUMsTUFBTSxFQUFFLENBQUMsQ0FBQztBQUMzQyxNQUFNLElBQUksQ0FBQyxXQUFXLENBQUMsT0FBTyxFQUFFLENBQUMsTUFBTSxFQUFFLENBQUMsQ0FBQztBQUMzQyxNQUFNLElBQUksQ0FBQyxXQUFXLENBQUMsT0FBTyxFQUFFLENBQUMsTUFBTSxFQUFFLENBQUMsQ0FBQztBQUMzQyxNQUFNLElBQUksQ0FBQyxXQUFXLENBQUMsT0FBTyxFQUFFLENBQUMsTUFBTSxFQUFFLENBQUMsQ0FBQztBQUMzQyxNQUFNLElBQUksQ0FBQyxXQUFXLENBQUMsT0FBTyxFQUFFLENBQUMsTUFBTSxFQUFFLENBQUMsQ0FBQztBQUMzQyxNQUFNLElBQUksQ0FBQyxXQUFXLENBQUMsT0FBTyxFQUFFLENBQUMsTUFBTSxFQUFFLENBQUMsQ0FBQztBQUMzQyxNQUFNLElBQUksQ0FBQyxXQUFXLENBQUMsT0FBTyxFQUFFLENBQUMsTUFBTSxFQUFFLENBQUMsQ0FBQztBQUMzQyxNQUFNLElBQUksQ0FBQyxXQUFXLENBQUMsT0FBTyxFQUFFLENBQUMsTUFBTSxFQUFFLENBQUMsQ0FBQztBQUMzQyxNQUFNLElBQUksQ0FBQyxXQUFXLENBQUMsT0FBTyxFQUFFLENBQUMsTUFBTSxFQUFFLENBQUMsQ0FBQztBQUMzQyxNQUFNLElBQUksQ0FBQyxXQUFXLENBQUMsT0FBTyxFQUFFLENBQUMsTUFBTSxFQUFFLENBQUMsQ0FBQztBQUMzQyxJQUFJO0FBQ0osR0FBRyxPQUFPO0FBQ1YsSUFBSSxHQUFHLEVBQUUsS0FBSztBQUNkLElBQUksSUFBSSxFQUFFLDhCQUE4QjtBQUN4QyxJQUFJO0FBQ0o7O0FBRUE7QUFDQSxFQUFFLElBQUksSUFBSSxDQUFDLEtBQUssQ0FBQyxDQUFDLElBQUksRUFBRSxJQUFJLEVBQUUsSUFBSSxFQUFFLElBQUksQ0FBQyxDQUFDLEVBQUU7QUFDNUM7QUFDQSxHQUFHLElBQUksSUFBSSxDQUFDLEtBQUssQ0FBQyxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsTUFBTSxFQUFFLENBQUMsRUFBRSxJQUFJLEVBQUUsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLEVBQUU7QUFDdEQsSUFBSSxPQUFPO0FBQ1gsS0FBSyxHQUFHLEVBQUUsS0FBSztBQUNmLEtBQUssSUFBSSxFQUFFLFlBQVk7QUFDdkIsS0FBSztBQUNMOztBQUVBO0FBQ0EsR0FBRyxJQUFJLElBQUksQ0FBQyxLQUFLLENBQUMsQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDLE1BQU0sRUFBRSxDQUFDLEVBQUUsSUFBSSxFQUFFLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxFQUFFO0FBQ3RELElBQUksT0FBTztBQUNYLEtBQUssR0FBRyxFQUFFLEtBQUs7QUFDZixLQUFLLElBQUksRUFBRSxZQUFZO0FBQ3ZCLEtBQUs7QUFDTDtBQUNBOztBQUVBLEVBQUUsSUFBSSxJQUFJLENBQUMsV0FBVyxDQUFDLE1BQU0sQ0FBQyxFQUFFO0FBQ2hDLEdBQUcsT0FBTztBQUNWLElBQUksR0FBRyxFQUFFLEtBQUs7QUFDZCxJQUFJLElBQUksRUFBRSw2QkFBNkI7QUFDdkMsSUFBSTtBQUNKOztBQUVBLEVBQUUsSUFBSSxJQUFJLENBQUMsS0FBSyxDQUFDLENBQUMsSUFBSSxFQUFFLElBQUksRUFBRSxJQUFJLEVBQUUsSUFBSSxDQUFDLENBQUMsRUFBRTtBQUM1QyxHQUFHLE9BQU87QUFDVixJQUFJLEdBQUcsRUFBRSxPQUFPO0FBQ2hCLElBQUksSUFBSSxFQUFFLHFCQUFxQjtBQUMvQixJQUFJO0FBQ0o7O0FBRUE7O0FBRUEsRUFBRSxJQUFJLElBQUksQ0FBQyxLQUFLLENBQUMsQ0FBQyxJQUFJLEVBQUUsSUFBSSxFQUFFLElBQUksRUFBRSxJQUFJLEVBQUUsSUFBSSxFQUFFLElBQUksQ0FBQyxDQUFDLEVBQUU7QUFDeEQsR0FBRyxPQUFPO0FBQ1YsSUFBSSxHQUFHLEVBQUUsSUFBSTtBQUNiLElBQUksSUFBSSxFQUFFLGtCQUFrQjtBQUM1QixJQUFJO0FBQ0o7O0FBRUEsRUFBRSxJQUFJLElBQUksQ0FBQyxXQUFXLENBQUMsUUFBUSxDQUFDLEVBQUU7QUFDbEMsR0FBRyxPQUFPO0FBQ1YsSUFBSSxHQUFHLEVBQUUsS0FBSztBQUNkLElBQUksSUFBSSxFQUFFLGlCQUFpQjtBQUMzQixJQUFJO0FBQ0o7O0FBRUEsRUFBRSxJQUFJLElBQUksQ0FBQyxLQUFLLENBQUMsQ0FBQyxJQUFJLEVBQUUsSUFBSSxFQUFFLElBQUksRUFBRSxJQUFJLEVBQUUsSUFBSSxFQUFFLElBQUksQ0FBQyxDQUFDLEVBQUU7QUFDeEQsR0FBRyxPQUFPO0FBQ1YsSUFBSSxHQUFHLEVBQUUsSUFBSTtBQUNiLElBQUksSUFBSSxFQUFFLDZCQUE2QjtBQUN2QyxJQUFJO0FBQ0o7O0FBRUEsRUFBRTtBQUNGLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQyxDQUFDLElBQUksRUFBRSxJQUFJLEVBQUUsSUFBSSxFQUFFLElBQUksRUFBRSxJQUFJLEVBQUUsR0FBRyxDQUFDO0FBQ2pELE9BQU8sSUFBSSxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsS0FBSyxHQUFHLElBQUksSUFBSSxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsS0FBSyxHQUFHO0FBQ3ZELElBQUk7QUFDSixHQUFHLE9BQU87QUFDVixJQUFJLEdBQUcsRUFBRSxLQUFLO0FBQ2QsSUFBSSxJQUFJLEVBQUUsOEJBQThCO0FBQ3hDLElBQUk7QUFDSjs7QUFFQSxFQUFFLElBQUksSUFBSSxDQUFDLFdBQVcsQ0FBQyxRQUFRLENBQUMsRUFBRTtBQUNsQyxHQUFHLE9BQU87QUFDVixJQUFJLEdBQUcsRUFBRSxLQUFLO0FBQ2QsSUFBSSxJQUFJLEVBQUUsV0FBVztBQUNyQixJQUFJO0FBQ0o7O0FBRUEsRUFBRSxJQUFJLElBQUksQ0FBQyxXQUFXLENBQUMsSUFBSSxDQUFDLEVBQUU7QUFDOUIsR0FBRyxNQUFNLE9BQU8sR0FBRyxJQUFJLENBQUMsTUFBTSxDQUFDLFFBQVEsQ0FBQyxRQUFRLEVBQUUsQ0FBQyxFQUFFLENBQUMsQ0FBQztBQUN2RCxHQUFHLElBQUksT0FBTyxDQUFDLEtBQUssQ0FBQyxLQUFLLENBQUMsSUFBSSxPQUFPLElBQUksSUFBSSxJQUFJLE9BQU8sSUFBSSxJQUFJLEVBQUU7QUFDbkUsSUFBSSxPQUFPO0FBQ1gsS0FBSyxHQUFHLEVBQUUsS0FBSztBQUNmLEtBQUssSUFBSSxFQUFFLGVBQWU7QUFDMUIsS0FBSztBQUNMO0FBQ0E7O0FBRUEsRUFBRSxJQUFJLElBQUksQ0FBQyxXQUFXLENBQUMsUUFBUSxDQUFDLEVBQUU7QUFDbEMsR0FBRyxPQUFPO0FBQ1YsSUFBSSxHQUFHLEVBQUUsTUFBTTtBQUNmLElBQUksSUFBSSxFQUFFLG9CQUFvQjtBQUM5QixJQUFJO0FBQ0o7O0FBRUE7O0FBRUEsRUFBRSxJQUFJLElBQUksQ0FBQyxXQUFXLENBQUMsU0FBUyxDQUFDLEVBQUU7QUFDbkMsR0FBRyxPQUFPO0FBQ1YsSUFBSSxHQUFHLEVBQUUsT0FBTztBQUNoQixJQUFJLElBQUksRUFBRSx1QkFBdUI7QUFDakMsSUFBSTtBQUNKOztBQUVBLEVBQUUsSUFBSSxJQUFJLENBQUMsV0FBVyxDQUFDLFNBQVMsQ0FBQyxFQUFFO0FBQ25DLEdBQUcsTUFBTSxTQUFTLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQztBQUM1QixHQUFHLE1BQU0sTUFBTSxHQUFHLE1BQU0sU0FBUyxDQUFDLFNBQVMsQ0FBQyxJQUFJQSxVQUFnQixDQUFDLEVBQUUsRUFBRSxPQUFPLENBQUMsQ0FBQztBQUM5RSxHQUFHLElBQUksTUFBTSxLQUFLLGVBQWUsRUFBRTtBQUNuQyxJQUFJLE9BQU87QUFDWCxLQUFLLEdBQUcsRUFBRSxLQUFLO0FBQ2YsS0FBSyxJQUFJLEVBQUUsbUJBQW1CO0FBQzlCLEtBQUs7QUFDTDs7QUFFQSxHQUFHLE9BQU87QUFDVixJQUFJLEdBQUcsRUFBRSxJQUFJO0FBQ2IsSUFBSSxJQUFJLEVBQUUsNEJBQTRCO0FBQ3RDLElBQUk7QUFDSjs7QUFFQSxFQUFFLElBQUksSUFBSSxDQUFDLFdBQVcsQ0FBQyxPQUFPLEVBQUUsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxDQUFDLENBQUMsRUFBRTtBQUM5QyxHQUFHLE1BQU0sU0FBUyxDQUFDLFVBQVUsQ0FBQyxJQUFJLENBQUMsTUFBTSxFQUFFLENBQUMsTUFBTSxFQUFFLEVBQUUsRUFBRSxTQUFTLEVBQUUsSUFBSSxDQUFDLENBQUM7QUFDekUsR0FBRyxJQUFJLElBQUksQ0FBQyxXQUFXLENBQUMsSUFBSSxFQUFFLENBQUMsTUFBTSxFQUFFLEVBQUUsQ0FBQyxDQUFDLEVBQUU7QUFDN0MsSUFBSSxPQUFPO0FBQ1gsS0FBSyxHQUFHLEVBQUUsS0FBSztBQUNmLEtBQUssSUFBSSxFQUFFLDhCQUE4QjtBQUN6QyxLQUFLO0FBQ0w7QUFDQTs7QUFFQTs7QUFFQSxFQUFFLElBQUksSUFBSSxDQUFDLEtBQUssQ0FBQyxDQUFDLElBQUksRUFBRSxJQUFJLEVBQUUsSUFBSSxFQUFFLElBQUksRUFBRSxJQUFJLEVBQUUsSUFBSSxFQUFFLElBQUksRUFBRSxJQUFJLENBQUMsQ0FBQyxFQUFFO0FBQ3BFO0FBQ0E7QUFDQTs7QUFFQTtBQUNBO0FBQ0E7O0FBRUEsR0FBRyxNQUFNLFNBQVMsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLENBQUM7O0FBRTdCLEdBQUcsZUFBZSxlQUFlLEdBQUc7QUFDcEMsSUFBSSxPQUFPO0FBQ1gsS0FBSyxNQUFNLEVBQUUsTUFBTSxTQUFTLENBQUMsU0FBUyxDQUFDRSxRQUFjLENBQUM7QUFDdEQsS0FBSyxJQUFJLEVBQUUsTUFBTSxTQUFTLENBQUMsU0FBUyxDQUFDLElBQUlGLFVBQWdCLENBQUMsQ0FBQyxFQUFFLFFBQVEsQ0FBQyxDQUFDO0FBQ3ZFLEtBQUs7QUFDTDs7QUFFQSxHQUFHLEdBQUc7QUFDTixJQUFJLE1BQU0sS0FBSyxHQUFHLE1BQU0sZUFBZSxFQUFFO0FBQ3pDLElBQUksSUFBSSxLQUFLLENBQUMsTUFBTSxHQUFHLENBQUMsRUFBRTtBQUMxQixLQUFLLE9BQU87QUFDWjs7QUFFQSxJQUFJLFFBQVEsS0FBSyxDQUFDLElBQUk7QUFDdEIsS0FBSyxLQUFLLE1BQU07QUFDaEIsTUFBTSxPQUFPO0FBQ2IsT0FBTyxHQUFHLEVBQUUsS0FBSztBQUNqQixPQUFPLElBQUksRUFBRSxXQUFXO0FBQ3hCLE9BQU87QUFDUCxLQUFLLEtBQUssTUFBTTtBQUNoQixNQUFNLE9BQU87QUFDYixPQUFPLEdBQUcsRUFBRSxNQUFNO0FBQ2xCLE9BQU8sSUFBSSxFQUFFLFlBQVk7QUFDekIsT0FBTztBQUNQLEtBQUs7QUFDTCxNQUFNLE1BQU0sU0FBUyxDQUFDLE1BQU0sQ0FBQyxLQUFLLENBQUMsTUFBTSxHQUFHLENBQUMsQ0FBQyxDQUFDO0FBQy9DO0FBQ0EsSUFBSSxRQUFRLFNBQVMsQ0FBQyxRQUFRLEdBQUcsQ0FBQyxHQUFHLFNBQVMsQ0FBQyxRQUFRLENBQUMsSUFBSTs7QUFFNUQsR0FBRyxPQUFPO0FBQ1YsSUFBSSxHQUFHLEVBQUUsS0FBSztBQUNkLElBQUksSUFBSSxFQUFFLFdBQVc7QUFDckIsSUFBSTtBQUNKOztBQUVBLEVBQUUsSUFBSSxJQUFJLENBQUMsS0FBSyxDQUFDLENBQUMsSUFBSSxFQUFFLElBQUksRUFBRSxJQUFJLEVBQUUsSUFBSSxFQUFFLElBQUksRUFBRSxJQUFJLEVBQUUsSUFBSSxFQUFFLElBQUksQ0FBQyxDQUFDLEVBQUU7QUFDcEUsR0FBRyxPQUFPO0FBQ1YsSUFBSSxHQUFHLEVBQUUsT0FBTztBQUNoQixJQUFJLElBQUksRUFBRSw0QkFBNEI7QUFDdEMsSUFBSTtBQUNKOztBQUVBLEVBQUUsSUFBSSxJQUFJLENBQUMsS0FBSyxDQUFDLENBQUMsSUFBSSxFQUFFLElBQUksRUFBRSxJQUFJLEVBQUUsSUFBSSxFQUFFLElBQUksRUFBRSxJQUFJLEVBQUUsSUFBSSxFQUFFLElBQUksQ0FBQyxDQUFDLEVBQUU7QUFDcEUsR0FBRyxPQUFPO0FBQ1YsSUFBSSxHQUFHLEVBQUUsS0FBSztBQUNkLElBQUksSUFBSSxFQUFFLG1CQUFtQjtBQUM3QixJQUFJO0FBQ0o7O0FBRUE7QUFDQSxFQUFFO0FBQ0YsR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFDLENBQUMsSUFBSSxFQUFFLElBQUksRUFBRSxJQUFJLEVBQUUsSUFBSSxDQUFDLEVBQUUsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxDQUFDLENBQUM7QUFDcEQsTUFBTSxJQUFJLENBQUMsS0FBSyxDQUFDLENBQUMsSUFBSSxFQUFFLElBQUksRUFBRSxJQUFJLEVBQUUsSUFBSSxDQUFDLEVBQUUsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxDQUFDLENBQUM7QUFDdkQsTUFBTSxJQUFJLENBQUMsS0FBSyxDQUFDLENBQUMsSUFBSSxFQUFFLElBQUksRUFBRSxJQUFJLEVBQUUsSUFBSSxDQUFDLEVBQUUsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxDQUFDLENBQUM7QUFDdkQsTUFBTSxJQUFJLENBQUMsS0FBSyxDQUFDLENBQUMsSUFBSSxFQUFFLElBQUksRUFBRSxJQUFJLEVBQUUsSUFBSSxDQUFDLEVBQUUsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxDQUFDLENBQUM7QUFDdkQsSUFBSTtBQUNKLEdBQUcsT0FBTztBQUNWLElBQUksR0FBRyxFQUFFLEtBQUs7QUFDZCxJQUFJLElBQUksRUFBRSxpQkFBaUI7QUFDM0IsSUFBSTtBQUNKOztBQUVBOztBQUVBLEVBQUUsSUFBSSxJQUFJLENBQUMsS0FBSyxDQUFDLENBQUMsSUFBSSxFQUFFLElBQUksRUFBRSxJQUFJLEVBQUUsSUFBSSxFQUFFLElBQUksRUFBRSxJQUFJLEVBQUUsSUFBSSxFQUFFLElBQUksRUFBRSxJQUFJLENBQUMsQ0FBQyxFQUFFO0FBQzFFLEdBQUcsT0FBTztBQUNWLElBQUksR0FBRyxFQUFFLEtBQUs7QUFDZCxJQUFJLElBQUksRUFBRSxxQkFBcUI7QUFDL0IsSUFBSTtBQUNKOztBQUVBLEVBQUUsSUFBSSxJQUFJLENBQUMsV0FBVyxDQUFDLFdBQVcsQ0FBQyxFQUFFO0FBQ3JDLEdBQUcsT0FBTztBQUNWLElBQUksR0FBRyxFQUFFLEtBQUs7QUFDZCxJQUFJLElBQUks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QVUsQ0FBQyxJQUFZLEVBQUE7UUFDckIsTUFBTSxlQUFlLEdBQUcsSUFBSSxDQUFDLFFBQVEsQ0FBQyxlQUFlLElBQUksRUFBRTtRQUUzRCxJQUFJLElBQUksQ0FBQyxRQUFRLENBQUMsU0FBUyxLQUFLLFFBQVEsRUFBRTtBQUN4QyxZQUFBLE9BQU8sQ0FBRyxFQUFBLElBQUksQ0FBRyxFQUFBLGVBQWUsRUFBRTs7YUFDN0IsSUFBSSxJQUFJLENBQUMsUUFBUSxDQUFDLFNBQVMsS0FBSyxNQUFNLEVBQUU7QUFDN0MsWUFBQSxPQUFPLEVBQUU7O2FBQ0osSUFBSSxJQUFJLENBQUMsUUFBUSxDQUFDLFNBQVMsS0FBSyxlQUFlLEVBQUU7QUFDdEQsWUFBQSxJQUFJLElBQUksS0FBSyxXQUFXLEVBQUU7QUFDeEIsZ0JBQUEsT0FBTyxFQUFFOztpQkFDSjtBQUNMLGdCQUFBLE9BQU8sQ0FBRyxFQUFBLElBQUksQ0FBRyxFQUFBLGVBQWUsRUFBRTs7O2FBRS9CO0FBQ0wsWUFBQSxPQUFPLENBQUcsRUFBQSxJQUFJLENBQUcsRUFBQSxlQUFlLEVBQUU7OztBQUl0QyxJQUFBLE9BQU8sc0JBQXNCLENBQzNCLE1BQWMsRUFDZCxNQUFjLEVBQ2QsV0FBbUIsRUFBQTtRQUVuQixJQUFJLEtBQUssR0FBRyxNQUFNLENBQUMsUUFBUSxFQUFFLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQztBQUN6QyxRQUFBLEtBQUssSUFBSSxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsR0FBRyxLQUFLLENBQUMsTUFBTSxFQUFFLENBQUMsRUFBRSxFQUFFO1lBQ3JDLElBQUksRUFBRSxHQUFHLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxPQUFPLENBQUMsTUFBTSxDQUFDO0FBQ2pDLFlBQUEsSUFBSSxFQUFFLElBQUksQ0FBQyxDQUFDLEVBQUU7Z0JBQ1osSUFBSSxJQUFJLEdBQUcsRUFBRSxJQUFJLEVBQUUsQ0FBQyxFQUFFLEVBQUUsRUFBRSxFQUFFLEVBQUU7QUFDOUIsZ0JBQUEsSUFBSSxFQUFFLEdBQUcsRUFBRSxJQUFJLEVBQUUsQ0FBQyxFQUFFLEVBQUUsRUFBRSxFQUFFLEdBQUcsTUFBTSxDQUFDLE1BQU0sRUFBRTtnQkFDNUMsTUFBTSxDQUFDLFlBQVksQ0FBQyxXQUFXLEVBQUUsSUFBSSxFQUFFLEVBQUUsQ0FBQztnQkFDMUM7Ozs7QUFJUDs7OzsiLCJ4X2dvb2dsZV9pZ25vcmVMaXN0IjpbMCwyLDMsNCw1LDYsNyw4LDksMTAsMTEsMTIsMTMsMTRdfQ==
