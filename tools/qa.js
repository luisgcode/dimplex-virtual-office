/* Office QA probe. Paste into the page console (or inject) on any ?time=HH:MM view.
   It watches the office for a few seconds and lists what looks wrong, with numbers:
   feet through the floor, hands under the desk, people standing inside each other,
   heads turned too far, speech bubbles covering each other, slow frames.
   Usage: await window.__qaRun(8)  -> report object (also logged as "[QA]"). */
window.__qaRun = async function(seconds){
  var BY = window.__vo.people, ids = Object.keys(BY), issues = {}, frames = [], last = performance.now();
  function flag(key, who, val){ var k = key + ":" + who; if (!issues[k]) issues[k] = { key:key, who:who, n:0, worst:val }; issues[k].n++; if (Math.abs(val) > Math.abs(issues[k].worst)) issues[k].worst = val; }
  var dbg = window.__dbg, V = dbg && dbg.T ? dbg.T.Vector3 : null;
  var v = V ? new V() : null, a = V ? new V() : null;
  var end = performance.now() + seconds * 1000, tick = 0, errs = 0, moved = {}, c = V ? new V() : null;
  var onErr = function(){ errs++; }; window.addEventListener("error", onErr);
  function lowest(p, cx, cz, rad, ymin){
    var low = 9;
    p.rig.model.traverse(function(o){
      if (!o.isSkinnedMesh || !o.visible) return;
      var n = o.geometry.attributes.position.count, step = Math.max(1, Math.floor(n / 300));
      for (var i = 0; i < n; i += step) { o.getVertexPosition(i, v); v.applyMatrix4(o.matrixWorld); if (cx !== undefined && (Math.hypot(v.x - cx, v.z - cz) > rad || v.y < ymin)) continue; if (v.y < low) low = v.y; }
    });
    return low;
  }
  while (performance.now() < end) {
    await new Promise(function(r){ requestAnimationFrame(r); });
    var now = performance.now(); frames.push(now - last); last = now; tick++;
    ids.forEach(function(id){
      var p = BY[id];
      if (!p.root || !p.root.visible || p.remote || !p.rig) return;
      var b = p.rig.b;
      /* lowest point of the body: sample skinned vertices every few frames */
      if (tick % 6 === 0 && v) {
        var low = lowest(p), seatedStill = p.state === "sit" && p.rig.sit > 0.99;
        if (low < (p.state === "walk" ? -0.035 : -0.02)) flag("below-floor", id + "(" + p.state + ")", +low.toFixed(3));
        if (!seatedStill && p.rig.sit < 0.01 && low > (p.state === "walk" ? 0.05 : 0.03)) flag("feet-floating", id + "(" + p.state + ")", +low.toFixed(3));
        if (seatedStill && low > 0.07 && !p.act && !p.postCur) flag("feet-floating", id + "(sit)", +low.toFixed(3));
        if (seatedStill && p.chairG && !p.act && !(p.roll > 0.01)) {
          p.rig.b.Hips.getWorldPosition(c);
          var seat = lowest(p, c.x, c.z, 0.12, c.y - 0.3);
          if (seat < 0.47) flag("sunk-into-chair", id, +seat.toFixed(3));
          if (seat > 0.56 && seat < 2) flag("hovering-over-chair", id, +seat.toFixed(3));
        }
      }
      if (p.state === "sit" && b && b.LeftHand && (p.typeOn || p.mouseOn) && !p.act && !p.chatWith && !(p.roll > 0.01) && p.rig.sit > 0.95) {
        ["LeftHand", "RightHand"].forEach(function(h){ b[h].getWorldPosition(a); if (a.y < 0.74) flag("hand-under-desk", id + "." + h, +a.y.toFixed(3)); });
      }
      if (!isFinite(p.root.position.x) || !isFinite(p.root.position.z)) flag("bad-position", id, 0);
      if (p.state === "walk") {
        var m = moved[id] || (moved[id] = { x:p.root.position.x, z:p.root.position.z, t:now });
        if (Math.hypot(p.root.position.x - m.x, p.root.position.z - m.z) > 0.05) moved[id] = { x:p.root.position.x, z:p.root.position.z, t:now };
        else if (now - m.t > 4000) flag("stuck-walking", id, +((now - m.t) / 1000).toFixed(1));
      } else delete moved[id];
      if (Math.abs(p.gazeYaw || 0) > 1.5) flag("head-turned-too-far", id, +(p.gazeYaw).toFixed(2));
      ids.forEach(function(qid){
        if (qid <= id) return; var q = BY[qid];
        if (!q.root || !q.root.visible || q.remote) return;
        var d = Math.hypot(p.root.position.x - q.root.position.x, p.root.position.z - q.root.position.z);
        if (d < 0.42 && (p.state !== "sit" || q.state !== "sit")) flag("too-close", id + "+" + qid, +d.toFixed(2));
      });
    });
    /* speech bubbles on screen covering each other */
    var bs = Array.prototype.slice.call(document.querySelectorAll(".tag .bubble")).filter(function(e){ return e.offsetParent && e.textContent && getComputedStyle(e).opacity > 0.5; }).map(function(e){ return e.getBoundingClientRect(); });
    for (var i = 0; i < bs.length; i++) for (var j = i + 1; j < bs.length; j++) {
      var r1 = bs[i], r2 = bs[j], ox = Math.min(r1.right, r2.right) - Math.max(r1.left, r2.left), oy = Math.min(r1.bottom, r2.bottom) - Math.max(r1.top, r2.top);
      if (ox > 8 && oy > 8) flag("bubbles-overlap", "screen", Math.round(ox * oy));
    }
  }
  /* name tags piled on top of each other */
  var tg = Array.prototype.slice.call(document.querySelectorAll(".tag")).filter(function(e){ return e.offsetParent && getComputedStyle(e).opacity > 0.5 && getComputedStyle(e).visibility !== "hidden"; }).map(function(e){ return e.querySelector(".n").getBoundingClientRect(); });
  for (var i2 = 0; i2 < tg.length; i2++) for (var j2 = i2 + 1; j2 < tg.length; j2++) {
    var q1 = tg[i2], q2 = tg[j2], ax = Math.min(q1.right, q2.right) - Math.max(q1.left, q2.left), ay = Math.min(q1.bottom, q2.bottom) - Math.max(q1.top, q2.top);
    if (ax > 0 && ay > 0 && ax * ay > 0.4 * q1.width * q1.height) flag("name-tags-overlap", "screen", Math.round(ax * ay));
  }
  Array.prototype.slice.call(document.querySelectorAll(".tag .bubble")).forEach(function(e){ if (!e.offsetParent || !e.textContent) return; var r = e.getBoundingClientRect(); if (r.left < 0 || r.top < 0 || r.right > innerWidth || r.bottom > innerHeight) flag("bubble-off-screen", "screen", 1); });
  window.removeEventListener("error", onErr);
  if (errs) flag("js-errors", "page", errs);
  frames.sort(function(x, y){ return x - y; });
  var rep = { at:document.querySelector(".clockhud") ? document.querySelector(".clockhud").textContent : "", medianFrameMs:+frames[Math.floor(frames.length / 2)].toFixed(1), p95FrameMs:+frames[Math.floor(frames.length * 0.95)].toFixed(1),
    issues:Object.keys(issues).map(function(k){ return issues[k]; }).sort(function(x, y){ return y.n - x.n; }) };
  console.log("[QA]", JSON.stringify(rep));
  return rep;
};
