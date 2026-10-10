-- Dev seed data for testing requirements 4, 5 and 10 (password_hash is a placeholder; login is out of scope).
INSERT INTO users (user_id, guc_email, password_hash, full_name, role) VALUES
 ('00000000-0000-0000-0000-000000000001','admin@guc.edu.eg','placeholder','Ada Admin','ADMIN'),
 ('00000000-0000-0000-0000-000000000002','advisor@guc.edu.eg','placeholder','Adam Advisor','ADVISOR'),
 ('00000000-0000-0000-0000-000000000003','sara@student.guc.edu.eg','placeholder','Sara Student','STUDENT'),
 ('00000000-0000-0000-0000-000000000004','omar@student.guc.edu.eg','placeholder','Omar Advising','STUDENT');

INSERT INTO student_profiles (student_id, guc_student_id, student_type, major, current_semester, academic_standing, assigned_advisor_id, workflow_status) VALUES
 ('00000000-0000-0000-0000-000000000003','64-12345','NORMAL','CS',5,'Good',NULL,'Schedule Assigned'),
 ('00000000-0000-0000-0000-000000000004','64-54321','ADVISING','DMET',7,'Probation','00000000-0000-0000-0000-000000000002','Draft');

INSERT INTO notifications (user_id, message) VALUES
 ('00000000-0000-0000-0000-000000000003','Your schedule has been processed.'),
 ('00000000-0000-0000-0000-000000000003','Welcome to 3ala-allah.'),
 ('00000000-0000-0000-0000-000000000004','Your draft schedule was updated.');
