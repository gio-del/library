'use strict';

// Toglie date e parentesi dal nome di un autore: «Rebecca 1981 Jarros» -> «Rebecca Jarros»,
// «Jarros, Rebecca <1981->» -> «Jarros, Rebecca», «Eco, Umberto (1932-2016)» -> «Eco, Umberto».
function cleanName(name) {
  if (typeof name !== 'string') return '';
  return name
    .replace(/[<(\[][^>)\]]*[>)\]]/g, ' ')
    .replace(/(?:\bn\.\s*)?\b\d{3,4}\s*-\s*(?:\d{3,4}\b)?/g, ' ')
    .replace(/(?:\bn\.\s*)?\b[12]\d{3}\b/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\s+,/g, ',')
    .replace(/^[\s,;-]+|[\s,;-]+$/g, '');
}

module.exports = { cleanName };
