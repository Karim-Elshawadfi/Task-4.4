// The weekly timetable shared by the offering details (Req 23) and the standard schedule
// (Req 28-30).
//
// It is drawn the way the good university scheduling tools draw it: a real time axis down the
// side, one column per teaching day, and every class a block positioned and sized by its actual
// start and end, in its course's colour. The shape of the week is readable before any label is.
// Classes that overlap (two tutorial groups at once) sit side by side, and a day with nothing
// on it stays visible so a study group can see its days off.
import React from 'react';
import { DAYS, DAY_LABEL, TYPE_LABEL, toMinutes, courseStyle } from './api';

const HOUR_PX = 54; // keep in step with --off-hour in offerings.css

/** Puts overlapping classes side by side: returns [slot, lane, laneCount] for each. */
function layout(ofDay) {
  const out = [];
  let cluster = [];
  let clusterEnd = -1;
  const flush = () => {
    const lanes = [];
    for (const slot of cluster) {
      let lane = lanes.findIndex((end) => end <= toMinutes(slot.start_time));
      if (lane === -1) { lane = lanes.length; lanes.push(0); }
      lanes[lane] = toMinutes(slot.end_time);
      out.push([slot, lane, 0]);
    }
    for (let i = out.length - cluster.length; i < out.length; i += 1) out[i][2] = lanes.length;
    cluster = [];
    clusterEnd = -1;
  };
  for (const slot of ofDay) {
    if (cluster.length && toMinutes(slot.start_time) >= clusterEnd) flush();
    cluster.push(slot);
    clusterEnd = Math.max(clusterEnd, toMinutes(slot.end_time));
  }
  if (cluster.length) flush();
  return out;
}

export default function WeeklyCalendar({
  slots = [],
  // 'group' is for one course's own week, where every block is the same course and the group
  // number is the useful headline.
  labelBy = 'course',
  offLabel = 'day off',
  emptyText = 'Nothing scheduled yet',
}) {
  const starts = slots.map((s) => toMinutes(s.start_time)).filter((n) => n != null);
  const ends = slots.map((s) => toMinutes(s.end_time)).filter((n) => n != null);
  const from = Math.floor(Math.min(8 * 60, ...(starts.length ? starts : [8 * 60])) / 60) * 60;
  const to = Math.ceil(Math.max(17 * 60, ...(ends.length ? ends : [17 * 60])) / 60) * 60;
  const hours = Math.max((to - from) / 60, 1);
  const y = (minutes) => ((minutes - from) / 60) * HOUR_PX;
  const used = new Set(slots.map((s) => s.day));

  return (
    <div className="off-tt-wrap">
      <div className="off-tt">
        <div className="off-tt-head off-tt-corner" />
        {DAYS.map((day) => (
          <div className={`off-tt-head${used.has(day) ? '' : ' off-is-off'}`} key={day} title={DAY_LABEL[day]}>
            {DAY_LABEL[day].slice(0, 3)}
          </div>
        ))}

        <div className="off-tt-gutter">
          {Array.from({ length: hours }, (_, h) => (
            <div className="off-tt-hour" key={h}>
              <span>{String(Math.floor((from + h * 60) / 60)).padStart(2, '0')}:00</span>
            </div>
          ))}
        </div>

        {DAYS.map((day) => {
          const ofDay = slots
            .filter((s) => s.day === day)
            .sort((a, b) => toMinutes(a.start_time) - toMinutes(b.start_time));
          return (
            <div
              className={`off-tt-col${used.has(day) ? '' : ' off-is-off'}`}
              key={day}
              style={{ height: `${hours * HOUR_PX}px` }}
            >
              {!ofDay.length && <div className="off-tt-empty">{used.size ? offLabel : ''}</div>}
              {layout(ofDay).map(([slot, lane, lanes]) => {
                const top = y(toMinutes(slot.start_time));
                const bottom = y(toMinutes(slot.end_time));
                const headline = labelBy === 'group' ? `${TYPE_LABEL[slot.type]} ${slot.group_number}` : slot.course_code;
                const detail = labelBy === 'group' ? slot.room : `${TYPE_LABEL[slot.type]} ${slot.group_number}`;
                return (
                  <div
                    className="off-tt-ev"
                    key={slot.slot_id || slot._id}
                    style={{
                      ...courseStyle(slot.course_code),
                      top: `${top + 1}px`,
                      height: `${Math.max(bottom - top - 2, 20)}px`,
                      left: `${(lane / lanes) * 100}%`,
                      width: `calc(${100 / lanes}% - 3px)`,
                    }}
                    title={`${slot.course_code} · ${TYPE_LABEL[slot.type]} ${slot.group_number}\n${DAY_LABEL[day]} ${slot.start_time}-${slot.end_time} · ${slot.room}`}
                  >
                    <b>{headline}</b>
                    <i>{detail}</i>
                    {bottom - top > 44 && labelBy !== 'group' && <i>{slot.room}</i>}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
      {!slots.length && <div className="off-state off-small">{emptyText}</div>}
    </div>
  );
}
