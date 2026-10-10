const baseUrl = process.env.P1_BASE_URL ?? "http://127.0.0.1:3000";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const statuses = [];
for (let i = 1; i <= 11; i += 1) {
  const response = await fetch(`${baseUrl}/api/auth`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-forwarded-for": `203.0.113.${i}`,
    },
    body: JSON.stringify({
      action: "login",
      phone: "0550000000",
      password: "wrong-password",
    }),
  });
  statuses.push(response.status);
}

assert(statuses.slice(0, 10).every((status) => status === 401), `expected first 10 attempts to reach authentication, got ${JSON.stringify(statuses)}`);
assert(statuses[10] === 429, `expected 11th attempt to be rate limited, got ${JSON.stringify(statuses)}`);

console.log("P1_RATE_LIMIT_REGRESSION_PASS");
