# gpiozero.tones: Tone, a musical note for TonalBuzzer.play()
#     from gpiozero.tones import Tone
#     Tone('A4').frequency == 440.0;  Tone(midi=60).note == 'C4';  Tone(frequency=262).midi == 60
_NOTES = {'C': 0, 'D': 2, 'E': 4, 'F': 5, 'G': 7, 'A': 9, 'B': 11}
_NAMES = ('C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B')


def _log2(x):
    import math
    return math.log(x) / math.log(2)


class Tone:
    def __init__(self, value=None, *, frequency=None, midi=None, note=None):
        if sum(1 for a in (value, frequency, midi, note) if a is not None) != 1:
            raise TypeError('must specify a value, frequency, midi number, or note')
        if isinstance(value, Tone):
            frequency = value.frequency
        elif isinstance(value, (str, bytes)):
            note = value
        elif value is not None:
            # gpiozero: a number below 128 is a MIDI note, anything else a frequency in Hz
            if 0 <= value < 128:
                midi = value
            else:
                frequency = value
        if note is not None:
            frequency = Tone._note_freq(note)
        elif midi is not None:
            if not 0 <= midi < 128:
                raise ValueError('invalid MIDI note: %r' % (midi,))
            frequency = 440.0 * 2 ** ((midi - 69) / 12)
        frequency = float(frequency)
        if frequency <= 0:
            raise ValueError('invalid frequency: %r' % (frequency,))
        self._f = frequency

    @staticmethod
    def _note_freq(note):
        s = note.decode() if isinstance(note, bytes) else str(note)
        s = s.strip().replace('♯', '#').replace('♭', 'b')
        if len(s) < 2 or s[0].upper() not in _NOTES:
            raise ValueError('invalid note: %r' % (note,))
        n = _NOTES[s[0].upper()]
        rest = s[1:]
        if rest[0] == '#':
            n += 1
            rest = rest[1:]
        elif rest[0] == 'b' and len(rest) > 1:
            n -= 1
            rest = rest[1:]
        try:
            octave = int(rest)
        except ValueError:
            raise ValueError('invalid note: %r' % (note,))
        return 440.0 * 2 ** ((12 * (octave + 1) + n - 69) / 12)

    @classmethod
    def from_frequency(cls, freq):
        return cls(frequency=freq)

    @classmethod
    def from_midi(cls, midi_note):
        return cls(midi=midi_note)

    @classmethod
    def from_note(cls, note):
        return cls(note=note)

    @property
    def frequency(self):
        return self._f

    @property
    def midi(self):
        m = round(12 * _log2(self._f / 440.0) + 69)
        if not 0 <= m < 128:
            raise ValueError('%r is outside the MIDI range' % self)
        return m

    @property
    def note(self):
        m = self.midi
        return '%s%d' % (_NAMES[m % 12], m // 12 - 1)

    def up(self, n=1):
        return Tone(frequency=self._f * 2 ** (n / 12))

    def down(self, n=1):
        return Tone(frequency=self._f / 2 ** (n / 12))

    def __float__(self):
        return self._f

    def __eq__(self, other):
        o = other._f if isinstance(other, Tone) else other
        try:
            return abs(self._f - float(o)) < 1e-6
        except (TypeError, ValueError):
            return False

    def __lt__(self, other):
        return self._f < float(other._f if isinstance(other, Tone) else other)

    def __hash__(self):
        return hash(self._f)

    def __str__(self):
        try:
            return self.note
        except ValueError:
            return '%.2fHz' % self._f

    def __repr__(self):
        try:
            return "<Tone note=%r midi=%d frequency=%.2fHz>" % (self.note, self.midi, self._f)
        except ValueError:
            return '<Tone frequency=%.2fHz>' % self._f
