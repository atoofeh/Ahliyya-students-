import { useRef, useState } from 'react';
import api from '../api/axios';

/** Keep one logical publish and its uploaded photo across safe retries. */
export default function useAnnouncementSend(endpoint, photoEndpoint) {
  const inFlight = useRef(false);
  const request = useRef(null);
  const [phase, setPhase] = useState(null);

  const send = async (form, photo) => {
    // React's disabled state is applied on the next render. This guard also
    // catches a second click in the same event loop and repeated Enter presses.
    if (inFlight.current) return null;
    inFlight.current = true;
    setPhase(photo ? 'uploading' : 'sending');
    try {
      const content = JSON.stringify(form);
      if (!request.current || request.current.content !== content
        || request.current.photo !== photo || request.current.endpoint !== endpoint) {
        request.current = { content, photo, endpoint, requestId: crypto.randomUUID(), image: null };
      }
      const pending = request.current;
      if (photo && !pending.image) {
        const body = new FormData();
        body.append('file', photo);
        const { data } = await api.post(photoEndpoint, body, { headers: { 'Content-Type': 'multipart/form-data' } });
        pending.image = data._id;
      }
      setPhase('sending');
      const { data } = await api.post(endpoint, { ...form, image: pending.image, requestId: pending.requestId });
      request.current = null;
      return data;
    } finally {
      inFlight.current = false;
      setPhase(null);
    }
  };

  return { send, phase, busy: phase !== null };
}
