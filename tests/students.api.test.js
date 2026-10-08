// End-to-end tests for Req 6-9 against an in-memory MongoDB.
// Run: node --test tests/
const test = require('node:test');
const assert = require('node:assert');
const express = require('express');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const request = require('supertest');
const { MongoMemoryServer } = require('mongodb-memory-server');
const User = require('../models/User');
const StudentProfile = require('../models/StudentProfile');
const { recordWorkflowAction } = require('../services/workflowStatus');

process.env.JWT_SECRET = 'test-secret';
const app = express().use('/api/students', require('../routes/studentRoutes'));
const auth = (user) => ({ Authorization: `Bearer ${jwt.sign({ id: user._id }, process.env.JWT_SECRET)}` });

let mongo, coordinator, advisor, omar, nour, laila;

test.before(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
  const base = { password_hash: 'x' };
  coordinator = await User.create({ ...base, full_name: 'Rania Lotfy', guc_email: 'coordinator@guc.edu.eg', role: 'COORDINATOR' });
  advisor = await User.create({ ...base, full_name: 'Amr Hassan', guc_email: 'amr.hassan@guc.edu.eg', role: 'ADVISOR' });

  const student = async (full_name, profile, account_status = 'ACTIVE') => {
    const u = await User.create({ ...base, full_name, account_status, guc_email: `${full_name.toLowerCase().replace(' ', '.')}@student.guc.edu.eg`, role: 'STUDENT' });
    await StudentProfile.create({ _id: u._id, ...profile });
    return u;
  };
  omar = await student('Omar Khaled', { guc_student_id: '52-1001', student_type: 'ADVISING', major: 'CS', current_semester: 5, academic_standing: 'Probation', assigned_advisor_id: advisor._id });
  nour = await student('Nour Ahmed', { guc_student_id: '52-1002', student_type: 'ADVISING', major: 'DMET', current_semester: 3, assigned_advisor_id: advisor._id }, 'DEACTIVATED');
  laila = await student('Laila Mahmoud', { guc_student_id: '56-2001', student_type: 'NORMAL', major: 'CS', current_semester: 3 });

  await recordWorkflowAction(nour._id, 'DRAFT_CREATED', advisor._id);
  await recordWorkflowAction(nour._id, 'SENT_FOR_STUDENT_REVIEW', advisor._id);
});

test.after(async () => {
  await mongoose.disconnect();
  await mongo.stop();
});

const list = (query = '') => request(app).get(`/api/students${query}`).set(auth(coordinator));

test('non-coordinators get 403', async () => {
  await request(app).get('/api/students').set(auth(advisor)).expect(403);
});

test('lists only students, newest update first, with derived status and blocking step', async () => {
  const { body } = await list().expect(200);
  assert.equal(body.total, 3);
  assert.equal(body.students[0].fullName, 'Nour Ahmed');
  assert.equal(body.students[0].workflowStatus, 'Ready for Student Review');
  assert.equal(body.students[0].blockingStep, 'Student review');
  assert.equal(body.students[0].assignedAdvisor.fullName, 'Amr Hassan');
  assert.equal(body.students[0].accountStatus, 'DEACTIVATED');
  assert.ok(!('password_hash' in body.students[0]));

  const omarRow = body.students.find((s) => s.id === omar._id);
  assert.equal(omarRow.workflowStatus, 'Not Started'); // no actions, no stored status
  const lailaRow = body.students.find((s) => s.id === laila._id);
  assert.equal(lailaRow.workflowStatus, 'Schedule Assigned');
  assert.equal(lailaRow.assignedAdvisor, null);
});

test('search hits users.full_name, users.guc_email and guc_student_id', async () => {
  assert.equal((await list('?search=khaled')).body.students[0].id, omar._id);
  assert.equal((await list('?search=laila.m')).body.students[0].id, laila._id);
  assert.deepEqual((await list('?search=52-')).body.students.map((s) => s.id).sort(), [omar._id, nour._id].sort());
});
