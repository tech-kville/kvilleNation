const express = require('express');
const cors = require('cors');
const session = require('express-session');
const MongoStore = require('connect-mongo');
require('dotenv').config();
const UserRoute = require('./routes/userRoutes');
const { fetchAllTents, patchTent, AirtableConfigError } = require('./lib/airtableTents');
const path = require('path');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const { isCheckInProgress, setCheckInProgress } = require('./lib/checkState');
const authenticateToken = require('./middleware/authenticateToken');

// Without this catch, a failed connection at startup — a DNS blip, Atlas
// briefly unreachable — takes the whole process down instead of logging and
// retrying. Mongoose keeps trying in the background, so the API recovers on
// its own once the database is reachable again.
mongoose.connect(process.env.MONGO_URL, {}).catch((err) => {
  console.error('Initial MongoDB connection failed; will keep retrying:', err.message);
});

mongoose.connection.on('connected', () => {
  console.log('Connected to MongoDB successfully');
});

mongoose.connection.on('error', (err) => {
  console.error('Error connecting to MongoDB:', err);
});

/** 
 * SET UP EXPRESS AND SOCKET.IO
 */
const app = express();
const server = http.createServer(app);

const allowedOrigins = [
  'http://localhost:3000',
  'https://kville-nation.vercel.app',
  'https://kvillenation.com',
  'https://www.kvillenation.com',
  
];

app.use(
  cors({
    origin: function (origin, callback) {
      console.log(`Origin: ${origin}`); // Log origin for debugging
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        console.error(`CORS error: ${origin} is not allowed`);
        callback(new Error(`Origin ${origin} not allowed by CORS`));
      }
    },
    credentials: true, // Allow cookies and credentials
  })
);
app.use(express.json());

// Session Middleware
app.use(
  session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({
      mongoUrl: process.env.MONGO_URL,
      ttl: 14 * 24 * 60 * 60, // 14 days
    }),
    cookie: {
      secure: process.env.NODE_ENV === 'production', // Set true for HTTPS
      httpOnly: true,
    },
  })
);

/**
 * SOCKET.IO SERVER
 */
const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    methods: ['GET', 'POST'],
    credentials: true,
  },
});

/** 
 * GLOBAL VARIABLES
 */
let activeTents = [];
let numCheckers = 1;
let excludedNames = [];
let selectedMembers = {};

/**
 * SOCKET.IO: handle real-time events
 */
io.on('connection', (socket) => {
  console.log(`Socket connected: ${socket.id}`);

  if (isCheckInProgress()) {
    socket.emit('checkStarted', {
      activeTents,
      numCheckers,
    });
  }
   socket.emit('excludedNamesUpdated', excludedNames);
   socket.emit('selectedMembersUpdated', selectedMembers);

  // 3) Listen for changes to excluded names from any client
  socket.on('excludedNamesUpdated', (newExcluded) => {
    // Overwrite the server's global array
    excludedNames = newExcluded;
    // Broadcast to all clients (including the one who sent it)
    io.emit('excludedNamesUpdated', excludedNames);
    console.log('excludedNames updated:', excludedNames);
  });
  socket.on('selectedMembersUpdated', (newSelected) => {
    selectedMembers = newSelected;
    io.emit('selectedMembersUpdated', selectedMembers);
  });
  socket.on('disconnect', () => {
    console.log(`Socket disconnected: ${socket.id}`);
  });
});

/**
 * Tent-check authentication.
 *
 * These endpoints were historically open: anyone with the URL could read every
 * roster or add a miss to any tent. Enforcing that is a breaking change for any
 * browser still running an older bundle, which mid-season means a Line Monitor
 * unable to load tents for a check.
 *
 * So it ships switched off. With REQUIRE_TENT_CHECK_AUTH unset, unauthenticated
 * requests are allowed but logged. Watch the logs; once those log lines stop,
 * every client has the new bundle and the flag can be set to "true" with no
 * risk to a live check.
 */
const ENFORCE_TENT_CHECK_AUTH = process.env.REQUIRE_TENT_CHECK_AUTH === 'true';

function tentCheckAuth(req, res, next) {
  if (ENFORCE_TENT_CHECK_AUTH) return authenticateToken(req, res, next);

  if (!req.headers.authorization) {
    console.warn(`[tent-check-auth] unauthenticated ${req.method} ${req.path} — still permitted (REQUIRE_TENT_CHECK_AUTH is off)`);
    return next();
  }
  return authenticateToken(req, res, next);
}

/** Only Line Monitors and superusers may record a miss or a make. */
function requireLineMonitor(req, res, next) {
  if (!ENFORCE_TENT_CHECK_AUTH && !req.user) return next();
  if (!req.user?.isLineMonitor && !req.user?.isSuperUser) {
    return res.status(403).json({ error: 'Line Monitors only' });
  }
  next();
}

/**
 * REST ENDPOINTS
 * We call io.emit(...) to broadcast changes
 */

// Public: the home page shows a tent count to logged-out visitors. Returning a
// single integer rather than 130 rosters lets /api/tent-checks sit behind
// authentication without breaking the public page.
app.get('/api/tent-count', async (req, res) => {
  try {
    const tents = await fetchAllTents();
    return res.json({ count: tents.length });
  } catch (error) {
    if (error instanceof AirtableConfigError) {
      return res.status(500).json({ error: 'Airtable config not set' });
    }
    console.error('Error fetching tent count:', error.response?.data || error.message);
    return res.status(500).json({ error: 'Failed to fetch tent count' });
  }
});

// Route to start check
app.post('/api/start-check', (req, res) => {
  const { tents, numCheckers: clientNumCheckers } = req.body;
  if (isCheckInProgress()) {
    return res.status(400).json({ error: 'Check already started' });
  }

  setCheckInProgress(true);
  numCheckers = clientNumCheckers || 1;
  const chunkSize = Math.ceil(tents.length / numCheckers);
  let assignedTents = [...tents];

  // Assign groupIndex in chunks
  for (let i = 0; i < numCheckers; i++) {
    const start = i * chunkSize;
    const end = start + chunkSize;
    const groupTents = assignedTents.slice(start, end);
    groupTents.forEach((tent) => {
      tent.groupIndex = i;
    });
  }

  activeTents = assignedTents;

  // Broadcast via Socket.IO
  io.emit('checkStarted', {
    activeTents,
    numCheckers,
  });
  console.log('A new check has started');
  return res.status(200).json({ success: true });
});

// Route to cancel the check
app.post('/api/cancel-check', (req, res) => {
  try {
    setCheckInProgress(false);
    activeTents = [];
    numCheckers = 1;
    excludedNames = [];
    selectedMembers = {}; 

    // Broadcast via Socket.IO
    io.emit('checkCanceled');
    io.emit('excludedNamesUpdated', excludedNames);
    io.emit('selectedMembersUpdated', selectedMembers); 
    console.log('Check canceled successfully');
    return res.status(200).send('Check canceled successfully');
  } catch (error) {
    console.error('Error canceling check:', error.message);
    return res.status(500).send('Failed to cancel check');
  }
});
// Route to end the check
app.post('/api/end-check', (req, res) => {
  try {
    setCheckInProgress(false);
    activeTents = [];
    numCheckers = 1;
    excludedNames = [];
    selectedMembers = {};

    // Broadcast via Socket.IO
    io.emit('checkEnded');
    io.emit('excludedNamesUpdated', excludedNames);
    io.emit('selectedMembersUpdated', selectedMembers); // Notify clients
    console.log('Check ended successfully');
    return res.status(200).send('Check ended successfully');
  } catch (error) {
    console.error('Error ending check:', error.message);
    return res.status(500).send('Failed to end check');
  }
});

// Route to update tent status (Miss or Make)
app.post('/api/tent-checks/update', tentCheckAuth, requireLineMonitor, async (req, res) => {
  const { id, misses, lastCheck, dateOfLastCheck, lastMissLM, dateOfLastMiss } = req.body;
  const fieldsToUpdate = {};
  if (misses !== undefined) fieldsToUpdate['Number of Misses'] = misses;
  if (lastCheck) fieldsToUpdate['Last Check'] = lastCheck;
  if (dateOfLastCheck) fieldsToUpdate['Date of Last Check'] = dateOfLastCheck;
  if (lastMissLM) fieldsToUpdate['Last Miss LM'] = lastMissLM;
  if (dateOfLastMiss) fieldsToUpdate['Date of Last Miss'] = dateOfLastMiss;

  try {
    await patchTent(id, fieldsToUpdate);

    activeTents = activeTents.filter((tent) => tent.id !== id);
    io.emit('tentStatusUpdated', { id });
    return res.status(200).send('Tent data updated successfully');
  } catch (error) {
    if (error instanceof AirtableConfigError) {
      return res.status(500).json({ error: 'Airtable config not set' });
    }
    console.error('Error updating tent data in Airtable:', error.response?.data || error.message);
    return res.status(500).send('Failed to update tent data');
  }
});

// Route to get tent data
app.get('/api/tent-checks', tentCheckAuth, async (req, res) => {
  try {
    return res.json(await fetchAllTents());
  } catch (error) {
    if (error instanceof AirtableConfigError) {
      return res.status(500).json({ error: 'Airtable config not set' });
    }
    console.error('Error fetching tent data from Airtable:', error.response?.data || error.message);
    return res.status(500).send('Failed to fetch tent data');
  }
});
// Route to get check status
app.get('/api/check-status', (req, res) => {
  try {
    return res.json({
      isCheckInProgress: isCheckInProgress(),
      activeTents: isCheckInProgress() ? activeTents : [],
    });
  } catch (error) {
    console.error('Error fetching check status:', error.message);
    return res.status(500).send('Failed to fetch check status');
  }
});

// Simple test route
app.get('/', (req, res) => {
  res.send('Hello from the Socket.IO server side!');
});

// Mount user routes
app.use('/api/profile', UserRoute);
app.use('/api/admin', require('./routes/adminRoutes'));
app.use('/api/airtable-config', require('./routes/airtableConfigRoutes'));
app.use('/uploads', express.static(path.join(__dirname, 'uploads'))); // serve files
app.use('/api/files', require('./routes/fileRoutes'));       
app.use('/api/tent-link', require('./routes/tentLinkRoutes'));
app.use('/api/roster', require('./routes/rosterRoutes'));
app.use('/api/season-status', require('./routes/seasonStatus'));

/**
 * START THE SERVER IF LOCAL
 */
const PORT = process.env.PORT || 8081;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
//module.exports = app;