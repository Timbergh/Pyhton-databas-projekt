const express = require('express');
const bodyParser = require('body-parser');
const session = require('express-session');
const crypto = require('crypto');
const mysql = require('mysql');

const app = express();
const port = 3000;

// Skapa en anslutning till MySQL-databasen
const connection = mysql.createConnection({
  host: "localhost",
  user: "root",
  password: "",
  database: "mail",
  multipleStatements: true,
});

connection.connect(err => {
  if (err) {
    console.error('Fel vid anslutning till databasen: ' + err.stack);
    return;
  }
  console.log('Ansluten till databasen');
});

// Konfigurera sessionshantering
app.use(
  session({
    secret: 'en-hämlig-nyckel!',
    resave: false,
    saveUninitialized: true
  })
);

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Krypterins funktion som använder crypto och sha256
function hash(data) {
  const hash = crypto.createHash("sha256");
  hash.update(data);
  return hash.digest("hex");
}


// Visa startsidan med e-mailformulär och inloggningsfält
app.get('/', (req, res) => {
  // Kontrollera om användaren är inloggad
  if (req.session.user) {
    res.send(`
      <h1>Välkommen till din e-mail!</h1>
      <h2>Skicka e-mailmeddelande</h2>
      <form action="/send" method="post">
        <input type="text" name="recipient" placeholder="Mottagarens e-mailadress"><br>
        <input type="text" name="subject" placeholder="Ämne"><br>
        <textarea rows="10" cols="50" name="message" placeholder="Meddelande"></textarea><br>
        <button type="submit">Skicka</button>
      </form>
      <h2>Mina e-mailmeddelanden</h2>
      <ul>
        <li><a href="/inbox">Min inkorg</a></li>
      </ul>
      <form action="/logout" method="post">
        <button type="submit">Logga ut</button>
      </form>
    `);
  } else {
    res.send(`
      <h1>Välkommen till din e-mail!</h1>
      <h2>Logga in</h2>
      <form action="/login" method="post">
        <input type="text" name="username" placeholder="Användarnamn"><br>
        <input type="password" name="password" placeholder="Lösenord"><br>
        <button type="submit">Logga in</button>
      </form>
      <h2>Registrera ett nytt konto</h2>
      <form action="/register" method="post">
        <input type="text" name="username" placeholder="Användarnamn"><br>
        <input type="password" name="password" placeholder="Lösenord"><br>
        <input type="text" name="email" placeholder="e-mailadress"><br>
        <button type="submit">Registrera</button>
      </form>
    `);
  }
});

// Registrera en ny användare
app.post('/register', (req, res) => {
  const username = req.body.username;
  const password = req.body.password;
  const email = req.body.email;

  // Kryptera lösenordet
  const hashedPassword = hash(password);

  // Spara användaruppgifterna i "users"-tabellen
  const query = 'INSERT IN TO users (username, password, email) VALUES (?, ?, ?)';
  connection.query(query, [username, hashedPassword, email], (err, result) => {
    if (err) {
      console.error('Fel vid sparande av användare: ' + err.stack);
      res.sendStatus(500);
      return;
    }
    res.redirect('/');
  });
});

// Logga in en användare
app.post('/login', (req, res) => {
  const username = req.body.username;
  const password = req.body.password;

  // Hämta användaruppgifterna från "users"-tabellen baserat på användarnamnet
  const query = 'SELECT * FROM users WHERE username = ?';
  connection.query(query, [username], (err, result) => {
    if (err) {
      console.error('Fel vid hämtning av användare: ' + err.stack);
      res.sendStatus(500);
      return;
    }

    if (result.length === 0) {
      res.send('Felaktigt användarnamn eller lösenord');
      return;
    }

    const user = result[0];

    // Jämför det angivna lösenordet med det lagrade krypterade lösenordet
    const hashedPassword = hash(password);
    console.log(hashedPassword, user.password)
    if (hashedPassword === user.password) {
      // Spara användaruppgifterna i sessionsvariabeln
      req.session.user = {
        id: user.id,
        username: user.username,
        email: user.email
      };
      res.redirect('/');
    } else {
      res.send('Felaktigt användarnamn eller lösenord');
    }
  });
});

// Logga ut användaren
app.post('/logout', (req, res) => {
  // Ta bort sessionsvariabeln för inloggning
  req.session.destroy(err => {
    if (err) {
      console.error('Fel vid utloggning: ' + err.stack);
      res.sendStatus(500);
      return;
    }
    res.redirect('/');
  });
});

// Hantera e-mailformuläret
app.post('/send', (req, res) => {
  // Kontrollera om användaren är inloggad innan e-mailmeddelandet skickas
  if (!req.session.user) {
    res.send('Du måste vara inloggad för att skicka e-mailmeddelanden');
    return;
  }

  const sender = req.session.user.email;
  const recipient = req.body.recipient;
  const subject = req.body.subject;
  const message = req.body.message;

  // Spara e-mailmeddelandet i databasen
  const query = 'INSERT INTO emails (sender, recipient, subject, message) VALUES (?, ?, ?, ?)';
  connection.query(query, [sender, recipient, subject, message], (err, result) => {
    if (err) {
      console.error('Fel vid sparande av e-mailmeddelande: ' + err.stack);
      res.sendStatus(500);
      return;
    }
    res.redirect('/');
  });
});

// Ta bort e-mailmeddelande
app.post('/delete', (req, res) => {
  // Kontrollera om användaren är inloggad innan e-mailmeddelandet tas bort
  if (!req.session.user) {
    res.send('Du måste vara inloggad för att ta bort e-mailmeddelanden');
    return;
  }

  const emailId = req.body.emailId;

  // Ta bort e-mailmeddelandet från databasen
  const query = 'DELETE FROM emails WHERE id = ?';
  connection.query(query, [emailId], (err, result) => {
    if (err) {
      console.error('Fel vid borttagning av e-mailmeddelande: ' + err.stack);
      res.sendStatus(500);
      return;
    }
    res.redirect('/inbox');
  });
});

// Visa inkorgen för den inloggade användaren
app.get('/inbox', (req, res) => {
  // Kontrollera om användaren är inloggad innan inkorgen visas
  if (!req.session.user) {
    res.send('Du måste vara inloggad för att visa inkorgen');
    return;
  }

  const recipient = req.session.user.email;

  // Hämta e-mailmeddelandena från databasen för den specifika mottagaren
  const query = 'SELECT * FROM emails WHERE recipient = ?';
  connection.query(query, [recipient], (err, result) => {
    if (err) {
      console.error('Fel vid hämtning av e-mailmeddelanden: ' + err.stack);
      res.sendStatus(500);
      return;
    }

    // Skapa en HTML-lista med e-mailmeddelandena
    const emails = result.map(email => `
      <li>
        <strong>Från:</strong> ${email.sender}<br>
        <strong>Ämne:</strong> ${email.subject}<br>
        <strong>Meddelande:</strong><br>
        <textarea rows="10" cols="50" readonly>${email.message}</textarea><br>
        <strong>Datum:</strong> ${email.sent}<br>
        <form action="/delete" method="post">
          <input type="hidden" name="emailId" value="${email.id}">
          <button type="submit">Ta bort</button>
        </form>
      </li><br>`
    ).join('');

    res.send(`
      <h1>Min inkorg</h1>
      <form action="/" method="get">
          <button type="submit">Gå tillbaka</button>
        </form>
      <ul>
        ${emails}
      </ul>
    `);
  });
});

// Starta servern
app.listen(port, () => {
  console.log('Servern lyssnar på port ' + port);
});
