import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, QueryCommand, UpdateCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb';
import { randomUUID } from 'crypto';

const AWS_REGION = process.env.AWS_REGION;
const TABLE_NAME = process.env.TABLE_NAME;

if (!AWS_REGION) {
  console.error('Missing AWS_REGION');
  process.exit(1);
}
if (!TABLE_NAME) {
  console.error('Missing TABLE_NAME');
  process.exit(1);
}

const client = new DynamoDBClient({ region: AWS_REGION });
const db = DynamoDBDocumentClient.from(client);

const app = express();
app.use(express.json());

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
app.use(express.static(path.join(__dirname, 'public')));

app.get('/health', (req, res) => {
  res.type('text').send('ok');
});

app.get('/todos', async (req, res) => {
  try {
    const command = new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: 'pk = :pk',
      ExpressionAttributeValues: { ':pk': 'TODO' },
      ScanIndexForward: false
    });
    const data = await db.send(command);
    const items = (data.Items || []).map(item => ({
      id: item.sk.replace('ITEM#', ''),
      content: item.content,
      completed: item.completed,
      createdAt: item.createdAt
    }));
    res.json(items);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/todos', async (req, res) => {
  try {
    const content = req.body.content;
    if (typeof content !== 'string' || content.trim() === '') {
      res.status(400).json({ error: 'Content required' });
      return;
    }
    const id = randomUUID();
    const item = {
      pk: 'TODO',
      sk: 'ITEM#' + id,
      content: content.trim(),
      completed: false,
      createdAt: new Date().toISOString()
    };
    const command = new PutCommand({ TableName: TABLE_NAME, Item: item });
    await db.send(command);
    res.status(201).json({
      id: id,
      content: item.content,
      completed: false,
      createdAt: item.createdAt
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/todos/:id', async (req, res) => {
  try {
    const id = req.params.id;
    const expr = [];
    const attrVals = {};
    if (req.body.content !== undefined) {
      expr.push('content = :c');
      attrVals[':c'] = req.body.content;
    }
    if (req.body.completed !== undefined) {
      expr.push('completed = :comp');
      attrVals[':comp'] = req.body.completed;
    }
    if (expr.length === 0) {
      res.status(400).json({ error: 'No valid fields to update' });
      return;
    }
    const command = new UpdateCommand({
      TableName: TABLE_NAME,
      Key: { pk: 'TODO', sk: 'ITEM#' + id },
      UpdateExpression: 'SET ' + expr.join(', '),
      ExpressionAttributeValues: attrVals,
      ReturnValues: 'ALL_NEW'
    });
    const data = await db.send(command);
    const attrs = data.Attributes;
    res.json({
      id: id,
      content: attrs.content,
      completed: attrs.completed,
      createdAt: attrs.createdAt
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/todos/:id', async (req, res) => {
  try {
    const id = req.params.id;
    const command = new DeleteCommand({
      TableName: TABLE_NAME,
      Key: { pk: 'TODO', sk: 'ITEM#' + id }
    });
    await db.send(command);
    res.status(204).send();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(3000, '0.0.0.0', () => {
  console.log('Server listening on port 3000');
});
