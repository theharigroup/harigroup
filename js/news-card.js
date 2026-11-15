// Shared news card (index.html + news.html). Fields: title, image, date, description, weblink, tag (optional).
function createNewsCard(item) {
  var esc = function (s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); };
  var parsed = newsTime(item);
  var isNew = !isNaN(parsed) && (Date.now() - parsed) < 90 * 864e5 && parsed <= Date.now() + 31 * 864e5;
  var tags = (item.date ? '<span class="news-tag news-tag-date">' + esc(item.date) + '</span>' : '') +
    (item.tag ? '<span class="news-tag">' + esc(item.tag) + '</span>' : '') + (isNew ? '<span class="news-tag news-tag-new">NEW</span>' : '');
  var img = item.image ? '<div class="news-imgwrap"><div class="news-img"><img src="' + esc(item.image) + '" alt="' + esc(item.title) + '" loading="lazy"></div></div>' : '';
  var link = item.weblink ? '<a class="news-btn" href="' + esc(item.weblink) + '" target="_blank" rel="noopener">Read More <i class="fa-solid fa-arrow-right"></i></a>' : '';
  return '<article class="news-card">' + (tags ? '<div class="news-tags">' + tags + '</div>' : '') + img +
    '<div class="news-body"><h3 class="news-title">' + esc(item.title) + '</h3><div class="news-bar"></div>' +
    '<p class="news-desc">' + esc(item.description) + '</p>' + link + '</div></article>';
}

// ---- shared helpers ----
function newsTime(item) {
  return Date.parse("1 " + String(item.date || "").replace(/^\s*(\w+)\s+(\d{4}).*$/, "$1 $2"));
}
// newest first; items with an unreadable date go last; ties keep their original order
function sortNewsByDate(list) {
  return list.map(function (it, i) { var t = newsTime(it); return { it: it, i: i, t: isNaN(t) ? -Infinity : t }; })
    .sort(function (a, b) { return (b.t - a.t) || (a.i - b.i); })
    .map(function (x) { return x.it; });
}
// Reads the newsItems list from news.html so news is edited in one place only.
function loadLatestNews(url, count) {
  return fetch(url, { cache: "no-cache" }).then(function (r) { if (!r.ok) throw new Error(r.status); return r.text(); }).then(function (html) {
    var m = html.match(/const\s+newsItems\s*=\s*(\[[\s\S]*?\n\s*\]);/);
    if (!m) throw new Error("newsItems not found");
    return sortNewsByDate(new Function("return " + m[1])()).slice(0, count);
  });
}
