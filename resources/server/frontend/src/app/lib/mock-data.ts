export interface Driver {
  id: string;
  name: string;
  avatar: string;
  status: 'available' | 'delivering' | 'offline';
  location: string;
  currentDelivery?: string;
  eta?: string;
  lat: number;
  lng: number;
  completedToday: number;
}

export interface Delivery {
  id: string;
  orderId: string;
  customerAddress: string;
  packageType: string;
  priority: 'low' | 'medium' | 'high';
  status: 'pending' | 'assigned' | 'in-progress' | 'completed' | 'delayed';
  assignedDriver?: string;
  timeline?: TimelineStep[];
  lat: number;
  lng: number;
}

export interface TimelineStep {
  status: string;
  timestamp: string;
  completed: boolean;
}

export const mockDrivers: Driver[] = [
  {
    id: 'D001',
    name: 'Sarah Johnson',
    avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150&h=150&fit=crop',
    status: 'delivering',
    location: 'Downtown District',
    currentDelivery: '#ORD-1234',
    eta: '12 mins',
    lat: 40.7489,
    lng: -73.9680,
    completedToday: 12
  },
  {
    id: 'D002',
    name: 'Michael Chen',
    avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&h=150&fit=crop',
    status: 'available',
    location: 'West Side',
    lat: 40.7589,
    lng: -73.9851,
    completedToday: 8
  },
  {
    id: 'D003',
    name: 'Emily Rodriguez',
    avatar: 'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=150&h=150&fit=crop',
    status: 'delivering',
    location: 'East Village',
    currentDelivery: '#ORD-1235',
    eta: '8 mins',
    lat: 40.7282,
    lng: -73.9842,
    completedToday: 15
  },
  {
    id: 'D004',
    name: 'James Wilson',
    avatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150&h=150&fit=crop',
    status: 'offline',
    location: 'Midtown',
    lat: 40.7580,
    lng: -73.9855,
    completedToday: 10
  },
  {
    id: 'D005',
    name: 'Maria Garcia',
    avatar: 'https://images.unsplash.com/photo-1487412720507-e7ab37603c6f?w=150&h=150&fit=crop',
    status: 'available',
    location: 'Upper East Side',
    lat: 40.7736,
    lng: -73.9566,
    completedToday: 7
  },
  {
    id: 'D006',
    name: 'David Kim',
    avatar: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=150&h=150&fit=crop',
    status: 'delivering',
    location: 'Chelsea',
    currentDelivery: '#ORD-1236',
    eta: '15 mins',
    lat: 40.7465,
    lng: -74.0014,
    completedToday: 11
  }
];

export const mockDeliveries: Delivery[] = [
  {
    id: 'DEL001',
    orderId: '#ORD-1237',
    customerAddress: '123 Park Ave, New York, NY',
    packageType: 'Electronics',
    priority: 'high',
    status: 'pending',
    lat: 40.7510,
    lng: -73.9777
  },
  {
    id: 'DEL002',
    orderId: '#ORD-1238',
    customerAddress: '456 Madison Ave, New York, NY',
    packageType: 'Documents',
    priority: 'medium',
    status: 'pending',
    lat: 40.7614,
    lng: -73.9776
  },
  {
    id: 'DEL003',
    orderId: '#ORD-1239',
    customerAddress: '789 Broadway, New York, NY',
    packageType: 'Food & Beverage',
    priority: 'high',
    status: 'pending',
    lat: 40.7260,
    lng: -73.9987
  },
  {
    id: 'DEL004',
    orderId: '#ORD-1234',
    customerAddress: '321 5th Ave, New York, NY',
    packageType: 'Clothing',
    priority: 'low',
    status: 'in-progress',
    assignedDriver: 'D001',
    lat: 40.7484,
    lng: -73.9857,
    timeline: [
      { status: 'Order placed', timestamp: '10:00 AM', completed: true },
      { status: 'Driver assigned', timestamp: '10:15 AM', completed: true },
      { status: 'Driver started route', timestamp: '10:30 AM', completed: true },
      { status: 'Current location', timestamp: '11:20 AM', completed: false },
      { status: 'Estimated arrival', timestamp: '11:32 AM', completed: false },
      { status: 'Delivery completed', timestamp: '', completed: false }
    ]
  },
  {
    id: 'DEL005',
    orderId: '#ORD-1235',
    customerAddress: '555 Lexington Ave, New York, NY',
    packageType: 'Electronics',
    priority: 'medium',
    status: 'in-progress',
    assignedDriver: 'D003',
    lat: 40.7549,
    lng: -73.9718,
    timeline: [
      { status: 'Order placed', timestamp: '10:30 AM', completed: true },
      { status: 'Driver assigned', timestamp: '10:45 AM', completed: true },
      { status: 'Driver started route', timestamp: '11:00 AM', completed: true },
      { status: 'Current location', timestamp: '11:25 AM', completed: false },
      { status: 'Estimated arrival', timestamp: '11:33 AM', completed: false },
      { status: 'Delivery completed', timestamp: '', completed: false }
    ]
  }
];

export const kpiData = {
  activeDeliveries: 28,
  availableDrivers: 15,
  completedToday: 142,
  delayedDeliveries: 3,
  activeDeliveriesTrend: 12,
  availableDriversTrend: -3,
  completedTodayTrend: 8,
  delayedDeliveriesTrend: -1
};

export const analyticsData = {
  weeklyDeliveries: [
    { day: 'Mon', deliveries: 124, delayed: 5 },
    { day: 'Tue', deliveries: 138, delayed: 3 },
    { day: 'Wed', deliveries: 145, delayed: 4 },
    { day: 'Thu', deliveries: 132, delayed: 6 },
    { day: 'Fri', deliveries: 156, delayed: 2 },
    { day: 'Sat', deliveries: 142, delayed: 3 },
    { day: 'Sun', deliveries: 98, delayed: 1 }
  ],
  driverPerformance: [
    { name: 'Sarah J.', completed: 156, avgTime: 24 },
    { name: 'Emily R.', completed: 148, avgTime: 22 },
    { name: 'David K.', completed: 134, avgTime: 26 },
    { name: 'Michael C.', completed: 128, avgTime: 25 },
    { name: 'Maria G.', completed: 112, avgTime: 28 }
  ],
  deliveryByHour: [
    { hour: '6AM', count: 12 },
    { hour: '9AM', count: 34 },
    { hour: '12PM', count: 56 },
    { hour: '3PM', count: 48 },
    { hour: '6PM', count: 38 },
    { hour: '9PM', count: 18 }
  ]
};
