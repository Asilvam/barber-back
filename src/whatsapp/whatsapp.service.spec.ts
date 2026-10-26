import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { WhatsappService } from './whatsapp.service';
import { AppointmentLinksService } from './appointment-links.service';

jest.mock('axios');
const get = jest.spyOn(axios, 'get');
describe('WhatsApp notification', () => {
  const settings = { WHATSAPP_NOTIFY_PHONE: '56900000000', CALLMEBOT_API_KEY: 'fake-test-key', WHATSAPP_ACTION_BASE_URL: 'https://api.example.test', WHATSAPP_ACTION_SECRET: 'test-action-secret-independent-123456789' };
  const appointment = { id: '507f1f77bcf86cd799439013', clientName: 'QA', barberName: 'Barber', date: '2028-01-01', timeSlot: '10:00' };
  beforeEach(() => jest.clearAllMocks());
  it('sends two distinct signed links with a bounded timeout', async () => {
    get.mockResolvedValue({ status: 200 });
    const config = new ConfigService(settings);
    await new WhatsappService(config, new AppointmentLinksService(config)).notifyAppointment(appointment);
    expect(get).toHaveBeenCalledWith(
      'https://api.callmebot.com/whatsapp.php',
      expect.objectContaining({
        timeout: 5000,
        maxRedirects: 0,
        params: expect.objectContaining({ phone: settings.WHATSAPP_NOTIFY_PHONE, apikey: settings.CALLMEBOT_API_KEY, text: expect.stringContaining('Aceptar:') as unknown }) as unknown,
      }),
    );
    const options = get.mock.calls[0][1] as { params: { text: string } };
    const tokens = Array.from(options.params.text.matchAll(/token=([^\s]+)/g), (match) => match[1]);
    const links = new AppointmentLinksService(config);
    expect(tokens.map((token) => links.verify(token).action)).toEqual(['accept', 'reject']);
  });
  it('does not call external services when unconfigured', async () => {
    const config = new ConfigService({});
    await new WhatsappService(config, new AppointmentLinksService(config)).notifyAppointment(appointment);
    expect(get).not.toHaveBeenCalled();
  });
  it('does not fail the booking when the provider times out', async () => {
    get.mockRejectedValue(new Error('timeout'));
    const config = new ConfigService(settings);
    await expect(new WhatsappService(config, new AppointmentLinksService(config)).notifyAppointment(appointment)).resolves.toBeUndefined();
  });
});
