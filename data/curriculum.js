// MET / DMET curriculum, copied from the "MET and DMET Curriculum" sheet of
// University_Schedule_Management_System.xlsx (2 hours = 1 lecture/tutorial/lab).
// Used by seed/seedAcademic.js to fill `course_catalogue` and by the academic
// services to know which courses belong to which major and semester.
//
// Format per course: [code, name, creditHours, prerequisites[], courseType, curriculum]
//   courseType : 'CORE' | 'ELECTIVE' | 'HUMA'
//   curriculum : [[major, semester], ...]   major is 'CS' or 'DMET'
//
// Notes on choices the sheet leaves open:
// - DMET 502 is semester 5 for DMET and semester 7 for CS (listed in both places).
//   The sheet shows 0 total hours for the DMET row; the CS row (2+2+2 = 6) is used.
// - "DMET603" prerequisite of DMET 703 is normalised to "DMET 603".
// - The Seminar has no code in the sheet; it is stored as HUMA 1002.
// - English courses are CORE; German, MNGT 601, Project Management and Seminar are
//   HUMA (Req 60 lists these as the humanities).
// - Semester 8 is the bachelor project, so it has no catalogue courses.

const BOTH = ['CS', 'DMET'];
const both = (sem) => BOTH.map((m) => [m, sem]);
const cs = (sem) => [['CS', sem]];
const dmet = (sem) => [['DMET', sem]];

const COURSES = [
  // ---- Semester 1 ----
  ['CSEN 102', 'Introduction to Computer Science', 6, [], 'CORE', both(1)],
  ['MATH 103', 'Maths', 8, [], 'CORE', both(1)],
  ['CHEMp 102', 'Chemistry (Lab)', 2, [], 'CORE', both(1)],
  ['CHEMt 102', 'Chemistry', 4, [], 'CORE', both(1)],
  ['PHYS 101', 'Physics', 5, [], 'CORE', both(1)],
  ['EDPT 201', 'Production Technology', 3, [], 'CORE', both(1)],
  // ---- Semester 2 ----
  ['MATH 203', 'Mathematics I', 8, ['MATH 103'], 'CORE', both(2)],
  ['PHYS 202', 'Physics II', 5, ['PHYS 101'], 'CORE', both(2)],
  ['CSEN 202', 'Introduction to Computer Programming', 6, ['CSEN 102'], 'CORE', both(2)],
  ['ENGD 301', 'Engineering Drawing & Design', 3, [], 'CORE', both(2)],
  ['ELCT 201', 'Digital Logic Design', 4, [], 'CORE', both(2)],
  // ---- Semester 3 ----
  ['MATH 301', 'Mathematics III', 8, ['MATH 103', 'MATH 203'], 'CORE', both(3)],
  ['PHYSp 301', 'Physics III (p)', 2, [], 'CORE', both(3)],
  ['PHYSt 301', 'Physics III (t)', 5, ['PHYS 101', 'PHYS 202'], 'CORE', both(3)],
  ['ELCT 301', 'Electric Circuits I', 6, [], 'CORE', both(3)],
  ['CSEN 301', 'Data Structures and Algorithms', 6, ['CSEN 102', 'CSEN 202'], 'CORE', both(3)],
  // ---- Semester 4 ----
  ['MATH 401', 'Mathematics IV Probability and Statistics', 4, ['MATH 103', 'MATH 203', 'MATH 301'], 'CORE', both(4)],
  ['CSEN 403', 'Concepts of Programming Languages', 4, ['CSEN 202'], 'CORE', both(4)],
  ['CSIS 402', 'Computer Organization and System Programming', 4, ['ELCT 201'], 'CORE', both(4)],
  ['CSEN 401', 'Computer Programming Lab', 4, ['CSEN 202', 'CSEN 301'], 'CORE', both(4)],
  ['ELCT 401', 'Electric Circuits II', 6, ['ELCT 301'], 'CORE', both(4)],
  ['COMM 401', 'Signal and System Theory', 6, ['MATH 103'], 'CORE', both(4)],
  // ---- Semester 5 ----
  ['MATH 501', 'Mathematics V (Discrete Math)', 4, [], 'CORE', both(5)],
  ['DMET 501', 'Introduction to Media Engineering', 4, ['CSEN 202'], 'CORE', both(5)],
  ['CSEN 501', 'Data Base I', 6, [], 'CORE', both(5)],
  ['CSEN 503', 'Introduction to Communication Networks', 4, ['CSEN 301'], 'CORE', both(5)],
  ['CSEN 605', 'Digital System Design', 4, [], 'CORE', both(5)],
  ['CSEN 502', 'Theory of Computation', 6, ['CSEN 202'], 'CORE', cs(5)],
  ['DMET 502', 'Computer Graphics', 6, ['CSEN 202', 'CSEN 301'], 'CORE', [['DMET', 5], ['CS', 7]]],
  // ---- Semester 6 ----
  ['CSEN 601', 'Computer System Architecture', 6, ['ELCT 201', 'CSIS 402'], 'CORE', both(6)],
  ['CSEN 602', 'Operating Systems', 4, ['CSEN 301'], 'CORE', both(6)],
  ['MNGT 601', 'Introduction to Management', 2, [], 'HUMA', both(6)],
  ['DMET 602', 'Network and Media Lab', 4, ['CSEN 503'], 'CORE', both(6)],
  ['CSEN 603', 'Software Engineering', 4, [], 'CORE', cs(6)],
  ['CSEN 604', 'Data Bases II', 4, ['CSEN 501'], 'CORE', cs(6)],
  ['DMET 601', 'Web Technologies and Usability', 4, ['CSEN 202'], 'CORE', dmet(6)],
  ['DMET 603', 'Digital Signal Processing', 4, ['COMM 401'], 'CORE', dmet(6)],
  // ---- Semester 7 ----
  ['CSEN 701', 'Embedded System Architecture', 5, [], 'CORE', both(7)],
  ['CSEN 703', 'Analysis and Design of Algorithms', 4, [], 'CORE', cs(7)],
  ['CSEN 702', 'Microprocessors', 5, ['CSEN 601'], 'CORE', cs(7)],
  ['CSEN 704', 'Advanced Computer Lab', 4, [], 'CORE', cs(7)],
  ['DMET 702', 'Visualization and Animation', 7, ['CSEN 202', 'CSEN 301', 'DMET 502'], 'CORE', dmet(7)],
  ['DMET 703', 'Video and Audio Technology', 4, ['DMET 603'], 'CORE', dmet(7)],
  ['DMET 704', 'Multimedia & Networking', 4, ['CSEN 503'], 'CORE', dmet(7)],
  ['DMET 706', 'Advanced Media Lab', 4, [], 'CORE', dmet(7)],
  // ---- Semester 9 ----
  ['DMET 901', 'Computer Vision', 4, ['DMET 502'], 'CORE', both(9)],
  ['CSEN 901', 'Artificial Intelligence', 4, ['CSEN 301'], 'CORE', cs(9)],
  ['CSEN 903', 'Advanced Computer Lab', 4, [], 'CORE', cs(9)],
  ['DMET 902', 'Advanced Video Processing', 4, ['DMET 603', 'DMET 703'], 'CORE', dmet(9)],
  ['DMET 904', 'Advanced Media Lab', 4, [], 'CORE', dmet(9)],
  // ---- Semester 10 ----
  ['HUMA 1001', 'Project Management', 4, [], 'HUMA', both(10)],
  ['HUMA 1002', 'Seminar', 2, [], 'HUMA', both(10)],
  ['CSEN 1001', 'Computer and Network Security', 4, [], 'CORE', cs(10)],
  ['CSEN 1002', 'Advanced Computer Lab', 4, [], 'CORE', cs(10)],
  ['CSEN 1003', 'Compiler', 4, ['CSEN 502'], 'CORE', cs(10)],
  ['DMET 1001', 'Image Processing', 4, ['DMET 603'], 'CORE', dmet(10)],
  ['DMET 1002', 'Advanced Media Lab', 4, [], 'CORE', dmet(10)],
  ['DMET 1003', 'Audio and Acoustics', 4, ['DMET 603', 'COMM 401'], 'CORE', dmet(10)],
  // ---- English (semesters 1-4) ----
  ['AS 102', 'English for Academic Purposes', 2, [], 'CORE', both(1)],
  ['SM 101', 'Scientific Methods', 2, [], 'CORE', both(2)],
  ['CPS 402', 'Communication and Presentation Skills', 2, [], 'CORE', both(3)],
  ['RPW 401', 'Research Paper Writing', 2, [], 'CORE', both(4)],
  // ---- German (semesters 1-4) ----
  ['DE 101', 'German 1', 4, [], 'HUMA', both(1)],
  ['DE 202', 'German 2', 4, [], 'HUMA', both(2)],
  ['DE 303', 'German 3', 4, [], 'HUMA', both(3)],
  ['DE 404', 'German 4', 4, [], 'HUMA', both(4)],
];

// 10 electives (Evaluation DB sheet). Taken in semesters 9 and 10, offered every season.
const ELECTIVES = [
  ['CSEN 1061', 'Machine Learning', 4, ['CSEN 301']],
  ['CSEN 1062', 'Cloud Computing', 4, ['CSEN 602']],
  ['CSEN 1063', 'Natural Language Processing', 4, ['CSEN 301']],
  ['CSEN 1064', 'Mobile Application Development', 4, ['CSEN 202']],
  ['CSEN 1065', 'Blockchain Fundamentals', 4, ['CSEN 503']],
  ['CSEN 1066', 'Information Retrieval', 4, ['CSEN 501']],
  ['DMET 1061', 'Game Development', 4, ['DMET 502']],
  ['DMET 1062', 'Augmented and Virtual Reality', 4, ['DMET 502']],
  ['DMET 1063', 'Human-Computer Interaction', 4, ['CSEN 202']],
  ['DMET 1064', '3D Modeling', 4, ['DMET 502']],
];

// Each major needs 2 electives in semester 9 and 2 in semester 10.
const ELECTIVE_SLOTS = [
  { semester: 9, count: 2 },
  { semester: 10, count: 2 },
];

const ENGLISH_CODES = ['AS 102', 'SM 101', 'CPS 402', 'RPW 401'];

// Odd semesters run in Winter, even semesters in Spring.
const seasonForSemester = (sem) => (sem % 2 === 1 ? 'WINTER' : 'SPRING');

function catalogueDocs() {
  const core = COURSES.map(([code, name, hours, prereqs, type, curriculum]) => {
    const semesters = curriculum.map(([, s]) => s);
    const seasons = [...new Set(semesters.map(seasonForSemester))];
    return {
      course_code: code,
      course_name: name,
      credit_hours: hours,
      course_type: type,
      majors: [...new Set(curriculum.map(([m]) => m))],
      curriculum: curriculum.map(([major, semester]) => ({ major, semester })),
      recommended_semester: Math.min(...semesters),
      offering_season: seasons.length === 1 ? seasons[0] : 'BOTH',
      prerequisites: prereqs,
    };
  });
  const electives = ELECTIVES.map(([code, name, hours, prereqs]) => ({
    course_code: code,
    course_name: name,
    credit_hours: hours,
    course_type: 'ELECTIVE',
    majors: BOTH,
    curriculum: [],
    recommended_semester: 9,
    offering_season: 'BOTH',
    prerequisites: prereqs,
  }));
  return [...core, ...electives];
}

module.exports = { COURSES, ELECTIVES, ELECTIVE_SLOTS, ENGLISH_CODES, seasonForSemester, catalogueDocs };
