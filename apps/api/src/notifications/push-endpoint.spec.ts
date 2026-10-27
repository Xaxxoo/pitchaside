import { isPushServiceUrl } from './notifications.service';

describe('isPushServiceUrl', () => {
  it("accepts the browsers' push services", () => {
    for (const url of [
      'https://fcm.googleapis.com/fcm/send/abc:def',
      'https://updates.push.services.mozilla.com/wpush/v2/gAAA',
      'https://web.push.apple.com/QGuQ',
      'https://wns2-par02p.notify.windows.com/w/?token=x',
    ]) {
      expect(isPushServiceUrl(url)).toBe(true);
    }
  });

  it('refuses anything the server could be pointed at inside its own network', () => {
    for (const url of [
      'http://fcm.googleapis.com/fcm/send/x',
      'https://localhost:3001/api',
      'https://169.254.169.254/latest/meta-data',
      'https://fcm.googleapis.com.evil.example/x',
      'https://fcm.googleapis.com:8443/x',
      'https://user:pw@fcm.googleapis.com/x',
      'http://api.railway.internal/x',
      'not a url',
    ]) {
      expect(isPushServiceUrl(url)).toBe(false);
    }
  });
});
