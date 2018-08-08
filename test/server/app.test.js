const request = require('supertest');

const server = require('../../server/app');

describe('Server', () => {
  it('responds to /', (done) => {
    request(server)
      .get('/')
      .expect(200, done);
  });

  it('returns a 404', (done) => {
    request(server)
      .get('/foo/bar')
      .expect(404, done);
  });
});
