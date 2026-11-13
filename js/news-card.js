// Shared news card (index.html + news.html). Fields: title, image, date, description, weblink, tag (optional).
function createNewsCard(item) {
  var esc = function (s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); };
  var parsed = Date.parse("1 " + String(item.date || "").replace(/^\s*(\w+)\s+(\d{4}).*$/, "$1 $2"));
  var isNew = !isNaN(parsed) && (Date.now() - parsed) < 90 * 864e5 && parsed <= Date.now() + 31 * 864e5;
  var img = item.image ? '<div class="news-img"><img src="' + esc(item.image) + '" alt="' + esc(item.title) + '" loading="lazy">' +
    (item.date ? '<span class="news-date">' + esc(item.date) + '</span>' : '') + '</div>' : '';
  var tags = (item.tag ? '<span class="news-tag">' + esc(item.tag) + '</span>' : '') + (isNew ? '<span class="news-tag news-tag-new">NEW</span>' : '');
  var link = item.weblink ? '<a class="news-btn" href="' + esc(item.weblink) + '" target="_blank" rel="noopener">Read more <i class="fa-solid fa-arrow-right"></i></a>' : '';
  return '<article class="news-card">' + img +
    '<div class="news-body">' + (tags ? '<div class="news-tags">' + tags + '</div>' : '') +
    '<h3 class="news-title">' + esc(item.title) + '</h3><div class="news-bar"></div>' +
    '<p class="news-desc">' + esc(item.description) + '</p>' + link + '</div></article>';
}
