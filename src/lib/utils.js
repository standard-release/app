/**
 * @copyright 2017-present, Charlike Mike Reagent <olsten.larck@gmail.com>
 * @license Apache-2.0
 */

const fs = require('fs')
const util = require('util')
const req = require('simple-get')

/**
 *
 * @param {*} context
 * @param {*} opts
 */
function getRepo (context, opts) {
  return Object.assign({}, context.repo(), opts, {
    ref: context.payload.head_commit.id,
  })
}

/**
 *
 * @param {*} base64
 */
function decodeBase64 (base64) {
  return Buffer.from(base64, 'base64').toString('utf8')
}

/**
 *
 * @param {*} fp
 */
function readFile (fp) {
  return util.promisify(fs.readFile)(fp, 'utf8')
}

/**
 *
 * @param {*} args
 */
function request (...args) {
  return new Promise((resolve, reject) => {
    req.concat(...args, (er, _, data) => {
      if (er) return reject(er)
      return resolve(data)
    })
  })
}

/**
 * export default utils
 */

module.exports = {
  getRepo,
  decodeBase64,
  readFile,
  request,
}
