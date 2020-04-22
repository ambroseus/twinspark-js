/* jshint esversion: 6 */

(function(window,document,tsname) {
  var twinspark = {};

  /// Internal data structures

  var READY = false;
  /** @type {boolean} */
  var DEBUG = window.localStorage._ts_debug || false;

  /** @type Array<{selector: string, handler: (function(Element): void)}> */
  var DIRECTIVES = [];


  /// Wrap attribute handling
  /** @type {function(Element, string): boolean} */
  function hasattr(el, attr) {
    return el.hasAttribute(attr);
  }

  /** @type {function(Element, string): string|null} */
  function getattr(el, attr) {
    return el.getAttribute(attr);
  }

  /** @type {function(Element, string, string): void} */
  function setattr(el, attr, value) {
    return el.setAttribute(attr, value);
  }

  /** @type {function(Element, string): ([Element, string])|null} */
  function findelattr(el, attr) {
    do {
      if (hasattr(el, attr))
        return [el, getattr(el, attr)];
    } while (el = el.parentElement);
  }

  /** @type {function(Element, string): string|null} */
  function findattr(el, attr) {
    var res = findelattr(el, attr);
    return res && res[1];
  }
  /// End wrap attribute handling


  /// Utils

  var err = console.log.bind(console, 'TwinSpark error:');
  /** @type {function(...*): void} */
  function log() {
    if (DEBUG) {
      console.log.apply(console, arguments);
    }
  }

  function groupBy(arr, keyfn) {
    return arr.reduce((acc, v) => {
      var key = keyfn(v);
      (acc[key] || (acc[key] = [])).push(v);
      return acc;
    }, {});
  }

  /** @type {function(Function): void} */
  function onload(fn) {
    if (document.readyState == 'loading') {
      document.addEventListener('DOMContentLoaded', fn);
    } else {
      fn();
    }
  }

  function qsf(el, selector) { // querySelectorFirst
    if (el.matches(selector))
      return el;
    return el.querySelector(selector);
  }

  function qse(el, selector) { // querySelectorEvery
    var els = Array.from(el.querySelectorAll(selector));
    if (el.matches(selector))
      els.unshift(el);
    return els;
  }

  /**
   * Collects all non-empty attribute values from element and its parents.
   * @type {function(Element, string): Array<string>} */
  function collect(el, attr) {
    var result = [];
    var value;

    do {
      value = getattr(el, attr);
      if (value) {
        result.push(value);
      }
    } while (el = el.parentElement);

    return result;
  }


  /** @type {function(Element, string, boolean, Object=): void} */
  function sendEvent(el, type, bubbles, attrs) {
    log('dispatching event', type, el, attrs);
    var event = new Event(type, {bubbles: bubbles});
    if (attrs) Object.assign(event, attrs);
    el.dispatchEvent(event);
  }


  /// Core

  /** @type {function(Element, {selector: string, handler: (function(Element): void)}): void} */
  function attach(el, directive) {
    qse(el, directive.selector).forEach(directive.handler);
  }

  /**
   * Registers new directive.
   * @param  {string} selector Directive selector.
   * @param  {function(Element): void} handler Directive callback.
   * @return void
   */
  function register(selector, handler) {
    var directive = {selector: selector, handler: handler};
    DIRECTIVES.push(directive);
    if (READY) {
      attach(document.body, directive);
    }
  }

  /** @type {function(Element): void} */
  function activate(el) {
    DIRECTIVES.forEach(d => attach(el, d));
    sendEvent(el, 'ts-ready', true);
  }

  /** @type {function(Array<Element>): void} */
  function autofocus(els) {
    if (!(Array.isArray(els))) {
      els = [els];
    }
    var toFocus = els.map(el => qse(el, '[autofocus]'))
        .filter(els => els.length)
        .reduce((acc, els) => acc.concat(els), []);

    if (toFocus.length > 0) {
      toFocus[toFocus.length - 1].focus();
    }
  }

  /** @type {function(Event=): void} */
  function init(_e) {
    activate(document.body);
    READY = true;
    log('init done');
  }

  onload(init);


  /// Ajax

  /** @type {function(number, *): Promise<*> } */
  function delay(ms, rv) {
    return new Promise(resolve => setTimeout(resolve, ms, rv || true));
  }

  /** @type {function(string, RequestInit): Promise<*> } */
  function xhr(url, opts) {
    return fetch(url, opts || undefined)
      .then(function(res) {
        return res.text().then(text => {
          res.content = text;
          return Promise.resolve(res);
        });
      });
  }


  /// Data collection

  /**
   * Parse either query string or JSON object.
   * @param {string} v String to be parsed.
   * @return URLSearchParams|Array<Array<string,*>>|null
   */
  function parseData(v) {
    if (v == "") return null;

    if (v.startsWith('{')) {
      var data = JSON.parse(v);
      if (typeof data === 'object' && data !== null) {
        return Object.entries(data);
      }
    } else {
      return new URLSearchParams(v);
    }
  }

  function mergeParams(p1, p2) {
    for (var x of p2) {
        if ((x[1] === null) || (x[1] === '')) {
          p1.delete(x[0]);
        } else {
          p1.append(x[0], x[1]);
        }
    }
    return p1;
  }

  /**
   * @type {function(Element): URLSearchParams}
   * @suppress {reportUnknownTypes}
   */
  function collectData(el) {
    // reduceRight because deepest element is the first one
    var data = collect(el, 'ts-data').reduceRight(
      (acc, v) => mergeParams(acc, parseData(v)),
      new URLSearchParams());
    return data;
  }


  /// History

  function storeCurrentState() {
    history.replaceState({html: document.body.innerHTML}, null);
  }

  function pushState(url, title) {
    // before every push replaces current data to store current state
    storeCurrentState();
    history.pushState(null, title, url);
  }

  window.addEventListener('popstate', e => {
    document.body.innerHTML = e.state.html;
    activate(document.body);
  });


  /// Fragments

  /** @type {function(Element): Element} */
  function findTarget(el) {
    var res = findelattr(el, 'ts-target');
    if (!res)
      return el;

    var target = res[0];
    var sel = res[1];

    if (sel == 'this')
      return target;
    if (sel.startsWith('parent '))
      return target.closest(sel.slice(7));
    if (sel.startsWith('child '))
      return target.querySelector(sel.slice(6));
    return document.querySelector(sel);
  }

  function findReply(el, reply) {
    var sel = findattr(el, 'ts-req-selector');
    if (!sel)
      return reply;

    if (sel == 'this')
      return reply;
    return qsf(reply, sel);
  }

  // Terminology:
  // `origin` - an element where request started from, a link or a button
  // `target` - where the incoming HTML will end up
  // `reply` - incoming HTML to end up in target
  /** @type {function(Array<Element>, string): Array<Element>} */
  function swap(url, origins, content) {
    var html = new DOMParser().parseFromString(content, 'text/html');
    var children = Array.from(html.body.children);

    if (children.length < origins.length) {
      throw ('Batch request requires at least ' + origins.length +
             ' elements, but only ' + children.length + ' were returned');
    }

    if (hasattr(origins[0], 'ts-req-history')) {
      // empty titles just don't change page title
      pushState(url, html.title);
    }

    var swapped = origins.map((origin, i) => {
      var target = findTarget(origin);
      var reply = findReply(origin, children[i]);
      var strategy = findattr(origin, 'ts-req-strategy') || 'replace';

      switch (strategy) {
      case 'replace': target.replaceWith(reply); break;
      case 'prepend': target.prepend(reply);     break;
      case 'append':  target.append(reply);      break;
      }

      activate(reply);
      return reply;
    });

    autofocus(swapped);

    storeCurrentState();
    return swapped;
  }

  function _doBatch(batch) {
    if (batch.length == 0) return;

    var url = batch[0].url;
    var method = batch[0].method;
    var data = batch.reduce(
      (acc, req) => mergeParams(acc, collectData(req.el)),
      new URLSearchParams()).toString();

    var qs = data && method == 'GET' ? '?' + data : '';
    var body = data && method != 'GET' ? data : null;

    var opts = {method:  method,
                headers: {'Accept': 'text/html+partial',
                          'Content-Type': body ? 'application/x-www-form-urlencoded' : ''},
                body:    body};
    var fullurl = url + qs;
    var req = xhr(fullurl, opts);
    var origins = batch.map(req => req.el);

    origins.forEach(el => el.classList.add('ts-active'));
    req
      .then(function(res) {
        origins.forEach(el => el.classList.remove('ts-active'));
        if (res.ok) {
          return swap(fullurl, origins, res.content);
        } else {
          err(res.content);
        }
      })
      .then(function(swapped) {
        if (swapped)
          swapped.forEach(el => doAction(el, null, findattr(el, 'ts-req-after')));
      })
      .catch(function(res) {
        origins.forEach(el => el.classList.remove('ts-active'));
        err('Network interrupt or something', arguments);
      });
  }

  function doBatch(batch) {
    // Skip requests unless `doAction` for `ts-req-before` returned `true`
    Promise
      .all(batch.map(req => doAction(req.el, null, findattr(req.el, 'ts-req-before'))))
      .then(result => batch.filter((req, i) => result[i]))
      .then(_doBatch);
  }

  // Batch Request Queue
  /** @type {reqs: Array<{el: Element, url: string, method: string, batch: boolean}>, request: Object} */
  var queue = {
    reqs: [],
    request: null
  };

  function executeRequests() {
    var batches = groupBy(queue.reqs, req => req.method + req.url);
    queue = {reqs: [], request: null};

    Object.values(batches).forEach(doBatch);
  }

  function queueRequest(req) {
    queue.reqs.push(req);
    if (!queue.request) {
      queue.request = setTimeout(executeRequests, 16);
    }
  }

  /** @type {function(Element, boolean): {el: Element, url: string, method: string, batch: boolean} } */
  function makeReq(el, batch) {
    var target = findTarget(el);
    var url = ((batch ? getattr(el, 'ts-req-batch') : getattr(el, 'ts-req')) ||
               (target.tagName == 'FORM' ? getattr(target, 'action') : getattr(el, 'href')));
    var method = getattr(el, 'ts-method') ||
        target.tagName == 'FORM' ? 'POST' : 'GET';

    return {el:     el,
            url:    url,
            method: method,
            batch:  batch};
  }
  // End Batch Request Queue

  register('[ts-req]', function(el) {
    el.addEventListener('click', function(e) {
      if (e.altKey || e.ctrlKey || e.shiftKey || e.metaKey || e.button != 0)
        return;

      e.preventDefault();
      doBatch([makeReq(el, false)]);
    });
    el.addEventListener('ts-trigger', e => doBatch([makeReq(el, false)]));
  });


  register('[ts-req-batch]', function(el) {
    el.addEventListener('click', function(e) {
      if (e.altKey || e.ctrlKey || e.shiftKey || e.metaKey || e.button != 0)
        return;

      e.preventDefault();
      queueRequest(makeReq(el, true));
    });
    el.addEventListener('ts-trigger', e => queueRequest(makeReq(el, true)));
  });


  /// Parsing actions

  /**
   * @type {function(string): string|number|Object}
   * @suppress {reportUnknownTypes}
   */
  function parseValue(s) {
    /** @type {string} */
    var c = s[0];
    if (c == '{' || c == '[') {
      return JSON.parse(s);
    }
    if (c == '"' || c == "'") {
      return s.slice(1, s.length - 1);
    }
    if (c >= '0' && c <= '9') {
      return parseFloat(s);
    }
    return s;
  }

  var CLOSING = {'"': '"', "'": "'", "{": "}", "[": "]"};

  /**
   * @type {function(string): Array<Array<string|number|Object>> }
   * @suppress {reportUnknownTypes}
   */
  function parseActionSpec(cmd) {
    var result = [];
    var command = [];
    var current = '';

    var string = null;
    var json = null;

    function consume() {
      var token = current.trim();
      if (token.length) {
        command.push(parseValue(token));
      }
      current = '';
    }

    for (var i = 0; i < cmd.length; i++) {
      var c = cmd[i];

      if (json) {
        current += c;
        if (c == CLOSING[json]) {
          json = null;
        }
      } else if (string) {
        current += c;
        if (c == CLOSING[string]) {
          string = null;
        }
      } else {
        if ((c == "{") || (c == "[")) {
          json = c;
        } else if ((c == "'") || (c == '"')) {
          string = c;
        } else if (c == " ") {
          consume();
          continue;
        } else if (c == ",") {
          consume();
          result.push(command);
          command = [];
          continue;
        }

        current += c;
      }
    }

    consume();
    if (command) {
      result.push(command);
    }
    return result;
  }


  /// Actions
  function classList(el, method, args) {
    return el.classList[method].apply(el.classList, args);
  }

  /**
   * @type {function(Element, Event, Array<string|number|Object>): Promise|null|undefined}
   * @suppress {checkTypes|reportUnknownTypes}
   */
  function executeCommand(target, e, command) {
    var cmd = command[0];
    if (typeof cmd != 'string') {
      throw 'Cannot work with action ' + cmd + ' of type ' + typeof cmd;
    }
    var args = command.slice(1);

    switch (cmd) {
    case 'delay':        return delay.apply(null, args);
    case 'stop':         return e.stopPropagation();
    case 'cancel':       return e.preventDefault();
    case 'addClass':     return classList(target, 'add',     args);
    case 'removeClass':  return classList(target, 'remove',  args);
    case 'toggleClass':  return classList(target, 'toggle',  args);
    case 'replaceClass': return classList(target, 'replace', args);
    }

    // remove etc
    if (cmd in target) {
      return target[cmd].apply(target, args);
    }

    // extension point
    if (cmd in window) {
      if (typeof window[cmd] != 'function') {
        return err("Expected function '" + cmd + "', but got", typeof window[cmd])
      }
      return window[cmd].apply(target, args);
    }

    return err('Unknown action', cmd);
  }

  /** @type {function(Element, Event, (string|null)): boolean} */
  function doAction(target, e, spec) {
    // special case for request-cancelling events
    if (!spec) return true;

    var commands = parseActionSpec(spec);

    return commands.reduce(function(p, command) {
      return p.then(function(_) { return executeCommand(target, e, command); });
    }, Promise.resolve(1));
  }

  register('[ts-action]', function(el) {
    el.addEventListener('ts-trigger', function(e) {
      doAction(findTarget(el), e, findattr(el, 'ts-action'));
    });
  });


  /// Triggers

  var obs = new IntersectionObserver(function(entries, obs) {
    entries.forEach(function(entry) {
      if (entry.isIntersecting) {
        sendEvent(entry.target, 'ts-trigger', false, {reason: entry});
      }
    });
  }, {rootMargin: '100px', threshold: 0.5});


  register('[ts-trigger]', function(el) {
    // intercooler modifiers? like changed, once, delay?
    var trigger = getattr(el, 'ts-trigger');
    if (trigger == null || trigger == '') return;

    trigger.split(',').forEach(function(t) {
      t = t.trim();
      if (t == 'load') {
        sendEvent(el, 'ts-trigger', false, {reason: 'load'});
      } else if (t == 'visible') {
        obs.observe(el);
      } else if (t != "") {
        el.addEventListener(t, function(e) {
          sendEvent(el, 'ts-trigger', false, {reason: e});
        });
      }
    });
  });


  /// Public interface

  twinspark = {
    onload: onload,
    register: register,
    activate: activate,
    log_toggle: function() {
      window.localStorage._ts_debug = DEBUG ? '' : 'true';
      DEBUG = !DEBUG;
    },
    _internal: {DIRECTIVES: DIRECTIVES,
                init: init,
                collect: collect,
                collectData: collectData,
                parse: parseActionSpec,
                obs: obs}
  };

  window[tsname] = twinspark;
})(window,document,'twinspark');
