function addDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next.toISOString().slice(0, 10);
}

const today = new Date();

export const DEMO_CUSTOMERS = [
  {
    id: "demo-1",
    full_name: "John Smith",
    customer_title: "mr",
    address: "12 Demo Street, Limassol",
    phone: "+357 99000001",
    email: "john.smith@example.com",
    notes: "Residential rooftop consultation",
    status: "Scheduled",
    appointment_date: addDays(today, 1),
    appointment_time: "09:00",
    latitude: 34.6786,
    longitude: 33.0413,
    route_order: 1,
    roof_plan_url: "",
    roof_photo_urls: []
  },
  {
    id: "demo-2",
    full_name: "Maria Petrova",
    customer_title: "mrs",
    address: "8 Sunset Road, Limassol",
    phone: "+357 99000002",
    email: "maria.petrova@example.com",
    notes: "Battery storage discussion",
    status: "Scheduled",
    appointment_date: addDays(today, 1),
    appointment_time: "11:00",
    latitude: 34.6901,
    longitude: 33.0552,
    route_order: 2,
    roof_plan_url: "",
    roof_photo_urls: []
  },
  {
    id: "demo-3",
    full_name: "David Brown",
    customer_title: "mr",
    address: "15 Green Avenue, Ypsonas",
    phone: "+357 99000003",
    email: "david.brown@example.com",
    notes: "Site survey and shading check",
    status: "Scheduled",
    appointment_date: addDays(today, 2),
    appointment_time: "14:00",
    latitude: 34.6884,
    longitude: 32.9618,
    route_order: 1,
    roof_plan_url: "",
    roof_photo_urls: []
  },
  {
    id: "demo-4",
    full_name: "Anna Papadopoulou",
    customer_title: "mrs",
    address: "3 Highland Park, Pano Polemidia",
    phone: "+357 99000004",
    email: "anna.p@example.com",
    notes: "Follow-up appointment",
    status: "Completed",
    appointment_date: addDays(today, -1),
    appointment_time: "10:30",
    latitude: 34.7098,
    longitude: 33.0031,
    route_order: null,
    roof_plan_url: "",
    roof_photo_urls: []
  },
  {
    id: "demo-5",
    full_name: "Michael Johnson",
    customer_title: "mr",
    address: "21 Sea View, Germasogeia",
    phone: "+357 99000005",
    email: "michael.j@example.com",
    notes: "PV system sizing consultation",
    status: "Scheduled",
    appointment_date: addDays(today, 4),
    appointment_time: "15:00",
    latitude: 34.7071,
    longitude: 33.0902,
    route_order: null,
    roof_plan_url: "",
    roof_photo_urls: []
  },
  {
    id: "demo-6",
    full_name: "Sophie Martin",
    customer_title: "mrs",
    address: "7 Olive Tree Road, Agios Tychonas",
    phone: "+357 99000006",
    email: "sophie.martin@example.com",
    notes: "New installation inquiry",
    status: "Scheduled",
    appointment_date: addDays(today, 6),
    appointment_time: "13:30",
    latitude: 34.7194,
    longitude: 33.1296,
    route_order: null,
    roof_plan_url: "",
    roof_photo_urls: []
  }
];

export const DEMO_SESSION = {
  access_token: "demo-session",
  user: {
    id: "demo-user",
    email: "demo@solarvisit.local",
    user_metadata: {
      full_name: "Demo User"
    }
  }
};
