import { readFile, writeFile } from "node:fs/promises";

const file = new URL("../app/page.tsx", import.meta.url);
let source = await readFile(file, "utf8");

function replaceOnce(search, replacement, label) {
  if (!source.includes(search)) throw new Error(`Anchor not found: ${label}`);
  source = source.replace(search, replacement);
}

if (!source.includes("async function neonMutate")) {
  replaceOnce(`async function loadStudentPhoto(studentId: number) {
  if (!supabase || !studentId) return "";
  const { data, error } = await supabase.from("students").select(STUDENT_PHOTO_COLUMNS).eq("id", studentId).maybeSingle();
  return error ? "" : String(data?.photo ?? "");
}
`, `async function loadStudentPhoto(studentId: number) {
  if (isNeonProvider || !supabase || !studentId) return "";
  const { data, error } = await supabase.from("students").select(STUDENT_PHOTO_COLUMNS).eq("id", studentId).maybeSingle();
  return error ? "" : String(data?.photo ?? "");
}

type NeonEntity = "student" | "room" | "team";
type NeonAction = "create" | "update" | "delete";

async function neonMutate<T>(entity: NeonEntity, action: NeonAction, payload?: unknown, id?: number) {
  const result = await fetchNeonJson<{ ok: boolean; data: T }>("/api/neon/mutate", {
    method: "POST",
    body: JSON.stringify({ entity, action, payload, id })
  });
  return result.data;
}
` , "neonMutate helper");
}

replaceOnce(`    setStudentList((current) => [...current, approvedStudent]);
    setPendingList((current) => current.filter((item) => item.id !== enrollment.id));
    if (supabase) {
      const { data } = await supabase.from("students").insert(toDbStudent(approvedStudent)).select("*").single();
      await supabase.from("pending_enrollments").delete().eq("id", enrollment.id);
      if (data) {
        setStudentList((current) => current.map((student) => (student.id === approvedStudent.id ? fromDbStudent(data) : student)));
      }
    }
`, `    setStudentList((current) => [...current, approvedStudent]);
    setPendingList((current) => current.filter((item) => item.id !== enrollment.id));
    if (isNeonProvider) {
      const data = await neonMutate<Student>("student", "create", approvedStudent);
      if (data) setStudentList((current) => current.map((student) => (student.id === approvedStudent.id ? data : student)));
    } else if (supabase) {
      const { data } = await supabase.from("students").insert(toDbStudent(approvedStudent)).select("*").single();
      await supabase.from("pending_enrollments").delete().eq("id", enrollment.id);
      if (data) {
        setStudentList((current) => current.map((student) => (student.id === approvedStudent.id ? fromDbStudent(data) : student)));
      }
    }
`, "approve enrollment neon");

replaceOnce(`    setStudentList((current) => current.map((item) => (item.id === updatedStudent.id ? updatedStudent : item)));
    if (supabase) {
      await supabase.from("students").update(toDbStudent(updatedStudent)).eq("id", updatedStudent.id);
    }
`, `    setStudentList((current) => current.map((item) => (item.id === updatedStudent.id ? updatedStudent : item)));
    if (isNeonProvider) {
      const data = await neonMutate<Student>("student", "update", updatedStudent, updatedStudent.id);
      if (data) setStudentList((current) => current.map((item) => (item.id === updatedStudent.id ? data : item)));
    } else if (supabase) {
      await supabase.from("students").update(toDbStudent(updatedStudent)).eq("id", updatedStudent.id);
    }
`, "student edit neon");

replaceOnce(`    if (supabase) {
      const { error } = await supabase.from("students").delete().eq("id", studentToDelete.id);
      if (error) {
        await supabase.from("students").delete().eq("ra", studentToDelete.ra);
      }
    }
`, `    if (isNeonProvider) {
      await neonMutate<{ deleted: boolean }>("student", "delete", undefined, studentToDelete.id);
    } else if (supabase) {
      const { error } = await supabase.from("students").delete().eq("id", studentToDelete.id);
      if (error) {
        await supabase.from("students").delete().eq("ra", studentToDelete.ra);
      }
    }
`, "student delete neon");

replaceOnce(`        setStudentList((current) => [...current, student]);
        if (supabase) {
          const { data } = await supabase.from("students").insert(toDbStudent(student)).select("*").single();
          if (data) {
            setStudentList((current) => current.map((item) => (item.id === student.id ? fromDbStudent(data) : item)));
          }
        }
`, `        setStudentList((current) => [...current, student]);
        if (isNeonProvider) {
          const data = await neonMutate<Student>("student", "create", student);
          if (data) setStudentList((current) => current.map((item) => (item.id === student.id ? data : item)));
        } else if (supabase) {
          const { data } = await supabase.from("students").insert(toDbStudent(student)).select("*").single();
          if (data) {
            setStudentList((current) => current.map((item) => (item.id === student.id ? fromDbStudent(data) : item)));
          }
        }
`, "student create neon");

replaceOnce(`    if (supabase) {
      await supabase.from("rooms").update(toDbRoom(updatedRoom)).eq("id", updatedRoom.id ?? 0);
      await supabase.from("team_members").update({ room: updatedRoom.name }).eq("role", "teacher").eq("name", updatedRoom.teacher);
    }
`, `    if (isNeonProvider) {
      const data = await neonMutate<Room>("room", "update", updatedRoom, updatedRoom.id);
      if (data) {
        setRoomList((current) => current.map((item) => (item.name === previousName || item.id === data.id ? data : item)));
        setSelectedRoom(data);
      }
    } else if (supabase) {
      await supabase.from("rooms").update(toDbRoom(updatedRoom)).eq("id", updatedRoom.id ?? 0);
      await supabase.from("team_members").update({ room: updatedRoom.name }).eq("role", "teacher").eq("name", updatedRoom.teacher);
    }
`, "room edit neon");

replaceOnce(`    if (supabase) {
      await supabase.from("rooms").update({ planning, planning_date: planningDate || null, planning_updated_by: updatedBy }).eq("name", roomName);
    }
`, `    if (isNeonProvider) {
      const roomToSave = roomList.find((room) => room.name === roomName);
      if (roomToSave) await neonMutate<Room>("room", "update", { ...roomToSave, planning, planningDate, planningUpdatedBy: updatedBy }, roomToSave.id);
    } else if (supabase) {
      await supabase.from("rooms").update({ planning, planning_date: planningDate || null, planning_updated_by: updatedBy }).eq("name", roomName);
    }
`, "room planning neon");

replaceOnce(`    if (supabase) {
      const { data } = await supabase.from("rooms").insert(toDbRoom(newRoom)).select("*").single();
      await supabase.from("team_members").update({ room: name }).eq("role", "teacher").eq("name", teacher);
      if (data) {
        const persistedRoom = fromDbRoom(data);
        setRoomList((current) => current.map((item) => (item.name === newRoom.name ? persistedRoom : item)));
        setSelectedRoom(persistedRoom);
      }
    }
`, `    if (isNeonProvider) {
      const persistedRoom = await neonMutate<Room>("room", "create", newRoom);
      if (persistedRoom) {
        setRoomList((current) => current.map((item) => (item.name === newRoom.name ? persistedRoom : item)));
        setSelectedRoom(persistedRoom);
      }
    } else if (supabase) {
      const { data } = await supabase.from("rooms").insert(toDbRoom(newRoom)).select("*").single();
      await supabase.from("team_members").update({ room: name }).eq("role", "teacher").eq("name", teacher);
      if (data) {
        const persistedRoom = fromDbRoom(data);
        setRoomList((current) => current.map((item) => (item.name === newRoom.name ? persistedRoom : item)));
        setSelectedRoom(persistedRoom);
      }
    }
`, "room create neon");

replaceOnce(`              setRoomList((current) => current.filter((room) => room.name !== deleteRoom.name));
              if (supabase) supabase.from("rooms").delete().eq("id", deleteRoom.id ?? 0);
              setDeleteRoom(null);
`, `              const roomToDelete = deleteRoom;
              setRoomList((current) => current.filter((room) => room.name !== roomToDelete.name));
              if (isNeonProvider) void neonMutate<{ deleted: boolean }>("room", "delete", undefined, roomToDelete.id);
              else if (supabase) supabase.from("rooms").delete().eq("id", roomToDelete.id ?? 0);
              setDeleteRoom(null);
`, "room delete neon");

replaceOnce(`    if (supabase) {
      const { data } = await supabase.from("team_members").insert(toDbTeam(newMember)).select("*").single();
      if (data) {
        setTeam((current) => current.map((member) => (member.id === newMember.id ? fromDbTeam(data) : member)));
      }
    }
`, `    if (isNeonProvider) {
      const data = await neonMutate<TeamMember>("team", "create", newMember);
      if (data) setTeam((current) => current.map((member) => (member.id === newMember.id ? data : member)));
    } else if (supabase) {
      const { data } = await supabase.from("team_members").insert(toDbTeam(newMember)).select("*").single();
      if (data) {
        setTeam((current) => current.map((member) => (member.id === newMember.id ? fromDbTeam(data) : member)));
      }
    }
`, "team create neon");

replaceOnce(`    if (supabase) {
      await supabase.from("team_members").update(toDbTeam(updatedMember)).eq("id", updatedMember.id);
    }
`, `    if (isNeonProvider) {
      const data = await neonMutate<TeamMember>("team", "update", updatedMember, updatedMember.id);
      if (data) setTeam((current) => current.map((item) => (item.id === updatedMember.id ? data : item)));
    } else if (supabase) {
      await supabase.from("team_members").update(toDbTeam(updatedMember)).eq("id", updatedMember.id);
    }
`, "team edit neon");

replaceOnce(`    if (supabase) {
      const primaryDelete = await supabase.from("team_members").delete().eq("id", memberToDelete.id).select("id");`, `    if (isNeonProvider) {
      await neonMutate<{ deleted: boolean }>("team", "delete", undefined, memberToDelete.id);
    } else if (supabase) {
      const primaryDelete = await supabase.from("team_members").delete().eq("id", memberToDelete.id).select("id");`, "team delete neon start");

await writeFile(file, source, "utf8");
