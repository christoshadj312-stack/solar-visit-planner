export function normalizePhone(phone = "") {
  const cleaned = phone.replace(/[^\d+]/g, "");
  return cleaned.startsWith("+") ? cleaned : `+${cleaned}`;
}

export function googleMapsUrl(address) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
}

export function wazeUrl(address) {
  return `https://waze.com/ul?q=${encodeURIComponent(address)}&navigate=yes`;
}

export function smsUrl(phone, message = "") {
  return `sms:${normalizePhone(phone)}?body=${encodeURIComponent(message)}`;
}

export function callUrl(phone) {
  return `tel:${normalizePhone(phone)}`;
}

export function whatsappUrl(phone, message = "") {
  return `https://wa.me/${normalizePhone(phone).replace("+", "")}?text=${encodeURIComponent(message)}`;
}

export function viberUrl(phone) {
  return `viber://chat?number=${normalizePhone(phone)}`;
}

export function appointmentReminderMessage(customer) {
  return `Καλησπέρα σας. Σας υπενθυμίζουμε το ραντεβού μας για αύριο στις ${customer.appointment_time}.,Ευχαριστούμε, SolarVisit`;
}

export function arrivalSoonMessage() {
  return "Καλησπέρα σας. Σε περίπου 15 λεπτά θα είμαστε κοντά σας. Ευχαριστούμε.";
}
