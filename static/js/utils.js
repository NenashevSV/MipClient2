// Установить аттрибуты массиву элементов
function setAttribute(els, attrName, attrValue) {
    if (Array.isArray(els) || NodeList.prototype.isPrototypeOf(els)) {
        for (let el of els) {
            setAttribute(el, attrName, attrValue)
        }
    } else {
        els.setAttribute(attrName, attrValue)
    }
}

// Удалить аттрибуты массиву элементов
function removeAttribute(els, attrName) {
    if (Array.isArray(els)  || NodeList.prototype.isPrototypeOf(els)) {
        for (let el of els) {
            removeAttribute(el, attrName)
        }
    } else {
        els.removeAttribute(attrName)
    }
}

function formatdate(date) {
    var options = {
      year: '2-digit',
      month: '2-digit',
      day: '2-digit',
      timezone: 'UTC',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    };
    return date.toLocaleString('ru', options);
}