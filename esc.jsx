(function() {
  const { useState, useEffect, useMemo } = React;

  // Constants
  const MARRIAGE_TIERS = [
    { min: 0, max: 5, pct: 0.15, label: 'Less than 5 years' },
    { min: 5, max: 10, pct: 0.25, label: '5 to less than 10 years' },
    { min: 10, max: 15, pct: 0.33, label: '10 to less than 15 years' },
    { min: 15, max: Infinity, pct: 0.50, label: '15 years or more' }
  ];

  const ASSET_TYPES = [
    { value: 'probate', label: 'Probate Property' },
    { value: 'revocable_trust', label: 'Revocable Trust' },
    { value: 'pod_tod', label: 'POD/TOD Account' },
    { value: 'joint_tbe', label: 'Joint Property (TBE w/ Spouse)' },
    { value: 'joint_jtwros', label: 'Joint Property (JTWROS w/ Non-Spouse)' },
    { value: 'life_insurance', label: 'Life Insurance' },
    { value: 'retirement', label: 'Retirement Account' },
    { value: 'annuity', label: 'Annuity' },
    { value: 'retained_interest', label: 'Transfer w/ Retained Interest' },
    { value: 'one_year_transfer', label: 'Transfer Within 1 Year' },
    { value: 'other', label: 'Other Asset' }
  ];

  const RESPONSIBLE_TYPES = [
    { value: 'personal_rep', label: 'Personal Representative' },
    { value: 'trustee', label: 'Trustee' },
    { value: 'beneficiary', label: 'Beneficiary' },
    { value: 'transferee', label: 'Transferee' }
  ];

  // Utilities
  const fmt = (v) => {
    if (v === null || v === undefined || isNaN(v)) return '$0.00';
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(v);
  };

  const pct = (v) => (v * 100).toFixed(0) + '%';

  const num = (v) => {
    if (!v) return 0;
    const n = parseFloat(String(v).replace(/[^0-9.-]/g, ''));
    return isNaN(n) ? 0 : n;
  };

  const calcYears = (m, d) => {
    if (!m || !d) return 0;
    const md = new Date(m), dd = new Date(d);
    let y = dd.getFullYear() - md.getFullYear();
    if (dd.getMonth() < md.getMonth() || (dd.getMonth() === md.getMonth() && dd.getDate() < md.getDate())) y--;
    return Math.max(0, y);
  };

  const getPct = (y) => (MARRIAGE_TIERS.find(t => y >= t.min && y < t.max) || MARRIAGE_TIERS[0]).pct;

  const calcDeadline = (d) => {
    if (!d) return null;
    const dt = new Date(d);
    dt.setMonth(dt.getMonth() + 6);
    return dt;
  };

  const genId = () => Math.random().toString(36).substr(2, 9);

  const STORAGE_KEY = 'nc_esc_v1';
  const save = (d) => { try { localStorage.setItem(STORAGE_KEY, JSON.stringify({...d, at: new Date().toISOString()})); } catch(e){} };
  const load = () => { try { return JSON.parse(localStorage.getItem(STORAGE_KEY)); } catch(e){ return null; } };
  const clear = () => { try { localStorage.removeItem(STORAGE_KEY); } catch(e){} };

  // Icons
  const ChevronRight = () => React.createElement('span', {className: 'esc-icon'}, '→');
  const ChevronLeft = () => React.createElement('span', {className: 'esc-icon'}, '←');
  const Plus = () => React.createElement('span', {className: 'esc-icon'}, '+');
  const Trash = () => React.createElement('span', {className: 'esc-icon'}, '×');
  const Check = () => React.createElement('span', {className: 'esc-icon'}, '✓');
  const Warning = () => React.createElement('span', {className: 'esc-icon'}, '⚠');
  const Info = () => React.createElement('span', {className: 'esc-icon'}, 'ℹ');
  const Calendar = () => React.createElement('span', {className: 'esc-icon'}, '📅');
  const Print = () => React.createElement('span', {className: 'esc-icon'}, '🖨');

  // Form Components
  const Input = ({label, hint, prefix, value, onChange, type='text', required, disabled, placeholder}) => (
    React.createElement('div', {className: 'esc-form-group'},
      label && React.createElement('label', {className: 'esc-label'},
        label,
        hint && React.createElement('span', {className: 'esc-label-hint'}, ' — ' + hint),
        required && React.createElement('span', {style: {color: 'var(--esc-error)'}}, ' *')
      ),
      React.createElement('div', {className: 'esc-input-wrap'},
        prefix && React.createElement('span', {className: 'esc-prefix'}, prefix),
        React.createElement('input', {
          type,
          value: value || '',
          onChange: e => onChange(e.target.value),
          placeholder,
          disabled,
          className: 'esc-input' + (prefix ? ' has-prefix' : '')
        })
      )
    )
  );

  const Select = ({label, hint, value, onChange, options, placeholder, required}) => (
    React.createElement('div', {className: 'esc-form-group'},
      label && React.createElement('label', {className: 'esc-label'},
        label,
        hint && React.createElement('span', {className: 'esc-label-hint'}, ' — ' + hint),
        required && React.createElement('span', {style: {color: 'var(--esc-error)'}}, ' *')
      ),
      React.createElement('select', {
        value: value || '',
        onChange: e => onChange(e.target.value),
        className: 'esc-select'
      },
        placeholder && React.createElement('option', {value: ''}, placeholder),
        options.map(o => React.createElement('option', {key: o.value, value: o.value}, o.label))
      )
    )
  );

  const Alert = ({type, children}) => (
    React.createElement('div', {className: 'esc-alert esc-alert-' + type},
      type === 'warning' && React.createElement(Warning),
      type === 'info' && React.createElement(Info),
      type === 'error' && React.createElement(Warning),
      type === 'success' && React.createElement(Check),
      React.createElement('div', {style: {flex: 1}}, children)
    )
  );

  // Main Calculator
  const Calculator = () => {
    const [mode, setMode] = useState(null);
    const [step, setStep] = useState(1);
    const [advanced, setAdvanced] = useState(false);
    const [agreed, setAgreed] = useState(false);
    const [showResults, setShowResults] = useState(false);

    const [basics, setBasics] = useState({
      deathDate: '', marriageDate: '', ncDomiciled: true,
      lettersDate: '', claimAfter2026: false
    });

    const [assets, setAssets] = useState([]);
    const [spouseRec, setSpouseRec] = useState({
      items: [], yearsAllowance: '', taxesAttr: '', claimsAlloc: ''
    });
    const [deductions, setDeductions] = useState({
      totalClaims: '', yearsAllowanceOthers: ''
    });
    const [quick, setQuick] = useState({
      totalAssets: '', totalClaims: '', yearsAllowanceOthers: '',
      propertyPassing: '', taxes: '', claimsOnSpouse: ''
    });

    // Load saved
    useEffect(() => {
      const s = load();
      if (s) {
        if (s.mode) setMode(s.mode);
        if (s.step) setStep(s.step);
        if (s.advanced) setAdvanced(s.advanced);
        if (s.basics) setBasics(s.basics);
        if (s.assets) setAssets(s.assets);
        if (s.spouseRec) setSpouseRec(s.spouseRec);
        if (s.deductions) setDeductions(s.deductions);
        if (s.quick) setQuick(s.quick);
      }
    }, []);

    // Auto-save
    useEffect(() => {
      if (mode) save({ mode, step, advanced, basics, assets, spouseRec, deductions, quick });
    }, [mode, step, advanced, basics, assets, spouseRec, deductions, quick]);

    // Calculations
    const calc = useMemo(() => {
      const years = calcYears(basics.marriageDate, basics.deathDate);
      const appPct = getPct(years);
      const deadline = calcDeadline(basics.lettersDate);

      if (mode === 'quick') {
        const ta = num(quick.totalAssets);
        const cl = num(quick.totalClaims);
        const yao = num(quick.yearsAllowanceOthers);
        const tna = ta - cl - yao;
        const prelim = tna * appPct;
        const pp = num(quick.propertyPassing);
        const tx = num(quick.taxes);
        const cs = num(quick.claimsOnSpouse);
        const npp = pp - tx - cs;
        const es = Math.max(0, prelim - npp);
        return { years, appPct, deadline, ta, cl, yao, tna, prelim, pp, tx, cs, npp, es, apportion: [] };
      }

      let ta = 0, pp = 0;
      const byPerson = {};

      assets.forEach(a => {
        let v = num(a.value);
        if (a.discountPct && a.type !== 'joint_tbe' && a.type !== 'joint_jtwros') {
          v = v * (1 - num(a.discountPct) / 100);
        }
        if (a.type === 'joint_tbe') v = v / 2;
        else if (a.type === 'joint_jtwros') {
          if (a.knownPortion) v = num(a.includablePortion);
          else v = v * (num(a.contribPct) || 100) / 100;
        }
        ta += v;
        if (a.passesToSpouse) pp += v;
        else {
          const pt = a.respType || 'beneficiary';
          const pn = a.respName || pt;
          if (!byPerson[pn]) byPerson[pn] = { type: pt, value: 0 };
          byPerson[pn].value += v;
        }
      });

      spouseRec.items.forEach(i => { pp += num(i.value); });
      pp += num(spouseRec.yearsAllowance);

      const cl = num(deductions.totalClaims);
      const yao = num(deductions.yearsAllowanceOthers);
      const tna = ta - cl - yao;
      const prelim = tna * appPct;
      const tx = num(spouseRec.taxesAttr);
      const cs = num(spouseRec.claimsAlloc);
      const npp = pp - tx - cs;
      const es = Math.max(0, prelim - npp);

      const totalNS = Object.values(byPerson).reduce((s, p) => s + p.value, 0);
      const apportion = Object.entries(byPerson).map(([n, d]) => ({
        name: n, type: d.type, value: d.value,
        share: totalNS > 0 ? (d.value / totalNS) * es : 0,
        pct: totalNS > 0 ? (d.value / totalNS) * 100 : 0
      }));

      return { years, appPct, deadline, ta, cl, yao, tna, prelim, pp, tx, cs, npp, es, apportion };
    }, [mode, basics, assets, spouseRec, deductions, quick]);

    // Warnings
    const warnings = useMemo(() => {
      const w = [];
      if (assets.some(a => a.type === 'one_year_transfer')) {
        w.push({ type: 'warning', msg: 'Transfer within 1 year detected. May be includable; consult counsel.' });
      }
      if (assets.some(a => a.type === 'joint_jtwros' && !a.knownPortion && !a.contribPct)) {
        w.push({ type: 'warning', msg: 'Joint property with non-spouse missing contribution info.' });
      }
      if (!basics.ncDomiciled) {
        w.push({ type: 'error', msg: 'NC elective share applies only to NC-domiciled decedents.' });
      }
      if (calc.deadline) {
        const days = Math.ceil((calc.deadline - new Date()) / (1000*60*60*24));
        if (days < 0) w.push({ type: 'error', msg: 'The 6-month deadline has passed.' });
        else if (days <= 30) w.push({ type: 'warning', msg: `Only ${days} days until filing deadline.` });
      }
      return w;
    }, [assets, basics, calc]);

    // Asset management
    const addAsset = () => setAssets([...assets, {
      id: genId(), type: 'probate', desc: '', value: '', passesToSpouse: false,
      respType: 'personal_rep', respName: '', discountPct: '', contribPct: '',
      knownPortion: false, includablePortion: ''
    }]);
    const updateAsset = (id, k, v) => {
      setAssets(assets.map(a => a.id === id ? {...a, [k]: v} : a));
      if (k === 'type' && ['one_year_transfer', 'joint_jtwros', 'retained_interest', 'revocable_trust'].includes(v)) setAdvanced(true);
    };
    const removeAsset = (id) => setAssets(assets.filter(a => a.id !== id));

    // Spouse items
    const addSpouseItem = () => setSpouseRec({
      ...spouseRec, items: [...spouseRec.items, { id: genId(), desc: '', value: '' }]
    });
    const updateSpouseItem = (id, k, v) => setSpouseRec({
      ...spouseRec, items: spouseRec.items.map(i => i.id === id ? {...i, [k]: v} : i)
    });
    const removeSpouseItem = (id) => setSpouseRec({
      ...spouseRec, items: spouseRec.items.filter(i => i.id !== id)
    });

    // Clear
    const handleClear = () => {
      if (confirm('Clear all data?')) {
        clear();
        setMode(null); setStep(1); setAdvanced(false); setAgreed(false); setShowResults(false);
        setBasics({ deathDate: '', marriageDate: '', ncDomiciled: true, lettersDate: '', claimAfter2026: false });
        setAssets([]); setSpouseRec({ items: [], yearsAllowance: '', taxesAttr: '', claimsAlloc: '' });
        setDeductions({ totalClaims: '', yearsAllowanceOthers: '' });
        setQuick({ totalAssets: '', totalClaims: '', yearsAllowanceOthers: '', propertyPassing: '', taxes: '', claimsOnSpouse: '' });
      }
    };

    // Navigation
    const goStep = (s) => { if (s >= 1 && s <= 5) { setStep(s); setShowResults(false); } };
    const next = () => { if (step < 5) setStep(step + 1); else if (agreed) setShowResults(true); };
    const prev = () => { if (showResults) setShowResults(false); else if (step > 1) setStep(step - 1); };

    // Mode selection
    if (!mode) {
      return React.createElement('div', {className: 'esc-card'},
        React.createElement('div', {className: 'esc-header'},
          React.createElement('h1', null, 'North Carolina Elective Share Calculator'),
          React.createElement('p', null, 'Calculate the surviving spouse\'s statutory share under NC law')
        ),
        React.createElement('div', {className: 'esc-content'},
          React.createElement('h2', {className: 'esc-title', style: {textAlign: 'center', marginBottom: '24px'}}, 'Choose Your Entry Method'),
          React.createElement('div', {className: 'esc-mode-selector'},
            React.createElement('div', {className: 'esc-mode-card', onClick: () => setMode('wizard')},
              React.createElement('h3', null, 'Guided Wizard', React.createElement('span', {className: 'esc-tag'}, 'Recommended')),
              React.createElement('p', null, 'Step-by-step asset entry with automatic calculations and "who pays" apportionment.'),
              React.createElement('ul', null,
                React.createElement('li', null, 'Asset-by-asset entry'),
                React.createElement('li', null, 'Automatic joint property calculations'),
                React.createElement('li', null, 'Detailed apportionment'),
                React.createElement('li', null, 'Warnings for complex scenarios')
              )
            ),
            React.createElement('div', {className: 'esc-mode-card', onClick: () => setMode('quick')},
              React.createElement('h3', null, 'Quick Totals'),
              React.createElement('p', null, 'Enter category totals directly if you already know your numbers.'),
              React.createElement('ul', null,
                React.createElement('li', null, 'Faster for professionals'),
                React.createElement('li', null, 'Assumes prepared figures'),
                React.createElement('li', null, 'Limited apportionment detail')
              )
            )
          ),
          React.createElement(Alert, {type: 'info'}, React.createElement('strong', null, 'Progress Auto-Saves: '), 'Your data is saved in your browser.')
        ),
        React.createElement('div', {className: 'esc-footer'}, 'This calculator is for informational purposes only and does not constitute legal advice.')
      );
    }

    // Quick mode
    if (mode === 'quick') {
      return React.createElement('div', {className: 'esc-card'},
        React.createElement('div', {className: 'esc-header'},
          React.createElement('h1', null, 'NC Elective Share Calculator'),
          React.createElement('p', null, 'Quick Totals Mode — Estimate')
        ),
        React.createElement('div', {className: 'esc-content'},
          React.createElement(Alert, {type: 'warning'}, React.createElement('strong', null, 'Estimate Only: '), 'Quick mode cannot calculate detailed apportionment. Use Guided Wizard for accurate results.'),
          !showResults ? React.createElement(React.Fragment, null,
            React.createElement('h2', {className: 'esc-title'}, 'Case & Marriage Information'),
            React.createElement('div', {className: 'esc-grid esc-grid-2'},
              React.createElement(Input, {label: 'Date of Death', type: 'date', value: basics.deathDate, onChange: v => setBasics({...basics, deathDate: v}), required: true}),
              React.createElement(Input, {label: 'Date of Marriage', type: 'date', value: basics.marriageDate, onChange: v => setBasics({...basics, marriageDate: v}), required: true})
            ),
            basics.marriageDate && basics.deathDate && React.createElement(Alert, {type: 'info'},
              React.createElement('strong', null, 'Marriage Duration: '), calc.years + ' years → ', React.createElement('strong', null, pct(calc.appPct)), ' applicable percentage'
            ),
            React.createElement('h2', {className: 'esc-title', style: {marginTop: '24px'}}, 'Estate Totals'),
            React.createElement('div', {className: 'esc-grid esc-grid-2'},
              React.createElement(Input, {label: 'Total Assets', prefix: '$', value: quick.totalAssets, onChange: v => setQuick({...quick, totalAssets: v}), placeholder: '0.00'}),
              React.createElement(Input, {label: 'Total Claims', hint: 'Debts, funeral, admin', prefix: '$', value: quick.totalClaims, onChange: v => setQuick({...quick, totalClaims: v}), placeholder: '0.00'})
            ),
            React.createElement(Input, {label: "Year's Allowance to Others", prefix: '$', value: quick.yearsAllowanceOthers, onChange: v => setQuick({...quick, yearsAllowanceOthers: v}), placeholder: '0.00'}),
            React.createElement('h2', {className: 'esc-title', style: {marginTop: '24px'}}, 'Property Passing to Spouse'),
            React.createElement('div', {className: 'esc-grid esc-grid-2'},
              React.createElement(Input, {label: 'Gross Property Passing', prefix: '$', value: quick.propertyPassing, onChange: v => setQuick({...quick, propertyPassing: v}), placeholder: '0.00'}),
              React.createElement(Input, {label: 'Death Taxes Attributable', prefix: '$', value: quick.taxes, onChange: v => setQuick({...quick, taxes: v}), placeholder: '0.00'})
            ),
            React.createElement(Input, {label: 'Claims Allocated to Spouse', prefix: '$', value: quick.claimsOnSpouse, onChange: v => setQuick({...quick, claimsOnSpouse: v}), placeholder: '0.00'}),
            React.createElement('div', {style: {marginTop: '24px'}},
              React.createElement('label', {className: 'esc-checkbox'},
                React.createElement('input', {type: 'checkbox', checked: agreed, onChange: e => setAgreed(e.target.checked)}),
                React.createElement('span', null, 'I understand this is an estimate for informational purposes only and does not constitute legal advice.')
              )
            ),
            React.createElement('div', {className: 'esc-btn-group esc-no-print'},
              React.createElement('button', {className: 'esc-btn esc-btn-secondary', onClick: () => setMode(null)}, React.createElement(ChevronLeft), ' Back'),
              React.createElement('div', {style: {display: 'flex', gap: '12px'}},
                React.createElement('button', {className: 'esc-btn esc-btn-secondary', onClick: handleClear}, 'Clear'),
                React.createElement('button', {className: 'esc-btn esc-btn-primary', onClick: () => agreed && setShowResults(true), disabled: !agreed}, 'Calculate ', React.createElement(ChevronRight))
              )
            )
          ) : React.createElement(React.Fragment, null,
            React.createElement('div', {className: 'esc-result-box'},
              React.createElement('div', {className: 'esc-result-label'}, 'Elective Share Amount'),
              React.createElement('div', {className: 'esc-result-amount'}, fmt(calc.es)),
              calc.es === 0 && React.createElement('div', {style: {fontSize: '14px', opacity: 0.9, marginTop: '8px'}}, "Spouse's receipts meet or exceed the elective share.")
            ),
            React.createElement('h3', {className: 'esc-title', style: {fontSize: '18px', marginBottom: '16px'}}, 'Calculation Breakdown'),
            React.createElement('table', {className: 'esc-table'},
              React.createElement('tbody', null,
                React.createElement('tr', null, React.createElement('td', null, 'Total Assets'), React.createElement('td', {style: {textAlign: 'right'}}, fmt(calc.ta))),
                React.createElement('tr', null, React.createElement('td', null, 'Less: Claims'), React.createElement('td', {style: {textAlign: 'right'}}, '(' + fmt(calc.cl) + ')')),
                React.createElement('tr', null, React.createElement('td', null, "Less: Year's Allowance to Others"), React.createElement('td', {style: {textAlign: 'right'}}, '(' + fmt(calc.yao) + ')')),
                React.createElement('tr', {className: 'highlight'}, React.createElement('td', null, React.createElement('strong', null, 'Total Net Assets')), React.createElement('td', {style: {textAlign: 'right'}}, React.createElement('strong', null, fmt(calc.tna)))),
                React.createElement('tr', null, React.createElement('td', null, 'Applicable % (' + calc.years + ' years)'), React.createElement('td', {style: {textAlign: 'right'}}, '× ' + pct(calc.appPct))),
                React.createElement('tr', {className: 'highlight'}, React.createElement('td', null, React.createElement('strong', null, 'Preliminary Share')), React.createElement('td', {style: {textAlign: 'right'}}, React.createElement('strong', null, fmt(calc.prelim)))),
                React.createElement('tr', null, React.createElement('td', null, 'Property Passing to Spouse'), React.createElement('td', {style: {textAlign: 'right'}}, fmt(calc.pp))),
                React.createElement('tr', null, React.createElement('td', null, 'Less: Taxes Attributable'), React.createElement('td', {style: {textAlign: 'right'}}, '(' + fmt(calc.tx) + ')')),
                React.createElement('tr', null, React.createElement('td', null, 'Less: Claims Allocated'), React.createElement('td', {style: {textAlign: 'right'}}, '(' + fmt(calc.cs) + ')')),
                React.createElement('tr', {className: 'highlight'}, React.createElement('td', null, React.createElement('strong', null, 'Net Property Passing')), React.createElement('td', {style: {textAlign: 'right'}}, React.createElement('strong', null, fmt(calc.npp)))),
                React.createElement('tr', {className: 'total'}, React.createElement('td', null, 'Elective Share'), React.createElement('td', {style: {textAlign: 'right'}}, fmt(calc.es)))
              )
            ),
            React.createElement('div', {className: 'esc-btn-group esc-no-print'},
              React.createElement('button', {className: 'esc-btn esc-btn-secondary', onClick: () => setShowResults(false)}, React.createElement(ChevronLeft), ' Edit'),
              React.createElement('div', {style: {display: 'flex', gap: '12px'}},
                React.createElement('button', {className: 'esc-btn esc-btn-outline', onClick: () => window.print()}, React.createElement(Print), ' Print'),
                React.createElement('button', {className: 'esc-btn esc-btn-primary', onClick: () => { setMode('wizard'); setShowResults(false); }}, 'Switch to Wizard')
              )
            )
          )
        ),
        React.createElement('div', {className: 'esc-footer'}, 'This calculator is for informational purposes only and does not constitute legal advice.')
      );
    }

    // Wizard mode
    const steps = [{n: 1, l: 'Basics'}, {n: 2, l: 'Assets'}, {n: 3, l: 'Spouse'}, {n: 4, l: 'Deductions'}, {n: 5, l: 'Results'}];

    const renderStep1 = () => React.createElement(React.Fragment, null,
      React.createElement('h2', {className: 'esc-title'}, 'Case Basics'),
      React.createElement('p', {className: 'esc-desc'}, 'Enter key dates and information about the decedent and marriage.'),
      React.createElement('div', {className: 'esc-grid esc-grid-2'},
        React.createElement(Input, {label: 'Date of Death', type: 'date', value: basics.deathDate, onChange: v => setBasics({...basics, deathDate: v}), required: true}),
        React.createElement(Input, {label: 'Date of Marriage', type: 'date', value: basics.marriageDate, onChange: v => setBasics({...basics, marriageDate: v}), required: true})
      ),
      basics.marriageDate && basics.deathDate && React.createElement(Alert, {type: 'info', style: {marginTop: '16px'}},
        React.createElement('strong', null, 'Marriage Duration: '), calc.years + ' years → Applicable %: ', React.createElement('strong', null, pct(calc.appPct))
      ),
      React.createElement('div', {style: {marginTop: '24px'}},
        React.createElement('label', {className: 'esc-checkbox'},
          React.createElement('input', {type: 'checkbox', checked: basics.ncDomiciled, onChange: e => setBasics({...basics, ncDomiciled: e.target.checked})}),
          React.createElement('span', null, 'Decedent was domiciled in North Carolina at death')
        )
      ),
      !basics.ncDomiciled && React.createElement(Alert, {type: 'error', style: {marginTop: '16px'}}, 'NC elective share law applies only to NC-domiciled decedents.'),
      React.createElement('div', {style: {marginTop: '24px'}},
        React.createElement(Input, {label: 'Date Letters Issued', hint: 'For 6-month deadline', type: 'date', value: basics.lettersDate, onChange: v => setBasics({...basics, lettersDate: v})})
      ),
      calc.deadline && React.createElement('div', {className: 'esc-deadline-box ' + (calc.deadline < new Date() ? 'passed' : Math.ceil((calc.deadline - new Date())/(1000*60*60*24)) <= 30 ? 'urgent' : 'ok')},
        React.createElement(Calendar),
        React.createElement('div', null,
          React.createElement('strong', null, 'Filing Deadline: ' + calc.deadline.toLocaleDateString('en-US', {weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'})),
          React.createElement('div', {style: {fontSize: '13px', marginTop: '2px'}},
            calc.deadline < new Date() ? 'Deadline has passed.' : Math.ceil((calc.deadline - new Date())/(1000*60*60*24)) + ' days remaining'
          )
        )
      ),
      React.createElement('div', {style: {marginTop: '24px', padding: '16px', background: 'var(--esc-light)', borderRadius: '8px'}},
        React.createElement('label', {className: 'esc-checkbox'},
          React.createElement('input', {type: 'checkbox', checked: basics.claimAfter2026, onChange: e => setBasics({...basics, claimAfter2026: e.target.checked})}),
          React.createElement('div', null,
            React.createElement('strong', null, 'Claim filed on or after January 1, 2026'),
            React.createElement('div', {style: {fontSize: '13px', color: 'var(--esc-text-light)', marginTop: '2px'}}, 'Session Law 2025-33 changed procedural requirements.')
          )
        )
      ),
      basics.claimAfter2026 && React.createElement(Alert, {type: 'info', style: {marginTop: '16px'}},
        React.createElement('strong', null, '2026 Changes: '), 'Petition must be verified, Rule 4 service applies, failure to serve within 6 months does not bar the claim.'
      )
    );

    const renderStep2 = () => React.createElement(React.Fragment, null,
      React.createElement('div', {style: {display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px', flexWrap: 'wrap', gap: '12px'}},
        React.createElement('div', null,
          React.createElement('h2', {className: 'esc-title'}, 'Assets'),
          React.createElement('p', {className: 'esc-desc', style: {marginBottom: 0}}, 'Enter each asset. Indicate who receives each.')
        ),
        !advanced && React.createElement('button', {className: 'esc-btn esc-btn-small esc-btn-secondary', onClick: () => setAdvanced(true)}, 'Enable Advanced Mode')
      ),
      assets.length === 0 ? React.createElement('div', {style: {textAlign: 'center', padding: '48px 24px', background: 'var(--esc-light)', borderRadius: '8px', marginBottom: '24px'}},
        React.createElement('p', {style: {color: 'var(--esc-text-light)', marginBottom: '16px'}}, 'No assets added. Click below to add your first asset.'),
        React.createElement('button', {className: 'esc-btn esc-btn-primary', onClick: addAsset}, React.createElement(Plus), ' Add Asset')
      ) : React.createElement(React.Fragment, null,
        assets.map((a, i) => React.createElement('div', {key: a.id, className: 'esc-asset-card'},
          React.createElement('div', {className: 'esc-asset-header'},
            React.createElement('span', {style: {fontSize: '13px', fontWeight: '600', color: 'var(--esc-text-light)'}}, 'Asset #' + (i + 1)),
            React.createElement('button', {className: 'esc-btn esc-btn-small', style: {color: 'var(--esc-error)', padding: '4px 8px'}, onClick: () => removeAsset(a.id)}, React.createElement(Trash))
          ),
          React.createElement('div', {className: 'esc-grid esc-grid-2'},
            React.createElement(Select, {label: 'Asset Type', value: a.type, onChange: v => updateAsset(a.id, 'type', v), options: ASSET_TYPES}),
            React.createElement(Input, {label: 'Description', value: a.desc, onChange: v => updateAsset(a.id, 'desc', v), placeholder: 'e.g., Bank account'})
          ),
          React.createElement('div', {className: 'esc-grid esc-grid-2'},
            React.createElement(Input, {label: 'Fair Market Value', prefix: '$', value: a.value, onChange: v => updateAsset(a.id, 'value', v), placeholder: '0.00'}),
            advanced && a.type !== 'joint_tbe' && a.type !== 'joint_jtwros' && React.createElement(Input, {label: 'Discount %', hint: 'If applicable', value: a.discountPct, onChange: v => updateAsset(a.id, 'discountPct', v), placeholder: '0'})
          ),
          a.type === 'joint_jtwros' && React.createElement('div', {style: {marginTop: '12px', padding: '12px', background: 'var(--esc-white)', borderRadius: '4px', border: '1px solid var(--esc-border)'}},
            React.createElement('div', {style: {fontSize: '13px', fontWeight: '600', marginBottom: '8px', color: 'var(--esc-primary)'}}, 'Joint Property Calculation'),
            React.createElement('label', {className: 'esc-checkbox', style: {marginBottom: '12px'}},
              React.createElement('input', {type: 'checkbox', checked: a.knownPortion, onChange: e => updateAsset(a.id, 'knownPortion', e.target.checked)}),
              React.createElement('span', {style: {fontSize: '13px'}}, 'I know the exact includable portion')
            ),
            a.knownPortion ?
              React.createElement(Input, {label: 'Includable Portion', prefix: '$', value: a.includablePortion, onChange: v => updateAsset(a.id, 'includablePortion', v), placeholder: '0.00'}) :
              React.createElement(Input, {label: "Decedent's Contribution %", value: a.contribPct, onChange: v => updateAsset(a.id, 'contribPct', v), placeholder: '100'})
          ),
          a.type === 'joint_tbe' && React.createElement(Alert, {type: 'info', style: {marginTop: '12px'}}, '½ of TBE property with spouse is automatically included.'),
          React.createElement('div', {style: {marginTop: '16px', paddingTop: '12px', borderTop: '1px solid var(--esc-border)'}},
            React.createElement('label', {className: 'esc-checkbox'},
              React.createElement('input', {type: 'checkbox', checked: a.passesToSpouse, onChange: e => updateAsset(a.id, 'passesToSpouse', e.target.checked)}),
              React.createElement('span', null, 'This asset passes to the surviving spouse')
            )
          ),
          !a.passesToSpouse && advanced && React.createElement('div', {className: 'esc-grid esc-grid-2', style: {marginTop: '12px'}},
            React.createElement(Select, {label: 'Responsible Person Type', value: a.respType, onChange: v => updateAsset(a.id, 'respType', v), options: RESPONSIBLE_TYPES}),
            React.createElement(Input, {label: 'Beneficiary Name', hint: 'Optional', value: a.respName, onChange: v => updateAsset(a.id, 'respName', v), placeholder: 'e.g., John Doe'})
          )
        )),
        React.createElement('button', {className: 'esc-btn esc-btn-outline', style: {marginTop: '8px'}, onClick: addAsset}, React.createElement(Plus), ' Add Another Asset')
      ),
      React.createElement('div', {className: 'esc-summary-box'},
        React.createElement('strong', null, 'Running Total Assets: '),
        React.createElement('span', {style: {float: 'right', fontSize: '18px', fontWeight: '600', color: 'var(--esc-primary)'}}, fmt(calc.ta))
      )
    );

    const renderStep3 = () => React.createElement(React.Fragment, null,
      React.createElement('h2', {className: 'esc-title'}, 'What the Spouse Received'),
      React.createElement('p', {className: 'esc-desc'}, 'Review and add any property passing to the surviving spouse.'),
      assets.filter(a => a.passesToSpouse).length > 0 && React.createElement('div', {style: {marginBottom: '24px'}},
        React.createElement('h4', {style: {fontSize: '14px', fontWeight: '600', marginBottom: '12px', color: 'var(--esc-text-med)'}}, 'From Assets (Step 2)'),
        assets.filter(a => a.passesToSpouse).map(a => React.createElement('div', {key: a.id, style: {display: 'flex', justifyContent: 'space-between', padding: '10px 14px', background: 'var(--esc-light)', borderRadius: '4px', marginBottom: '6px', fontSize: '14px'}},
          React.createElement('span', null, a.desc || ASSET_TYPES.find(t => t.value === a.type)?.label),
          React.createElement('span', {style: {fontWeight: '500'}}, fmt(num(a.value)))
        ))
      ),
      React.createElement('h4', {style: {fontSize: '14px', fontWeight: '600', marginBottom: '12px', color: 'var(--esc-text-med)'}}, 'Additional Property'),
      spouseRec.items.length === 0 ? React.createElement('div', {style: {textAlign: 'center', padding: '24px', background: 'var(--esc-light)', borderRadius: '8px', marginBottom: '16px'}},
        React.createElement('p', {style: {color: 'var(--esc-text-light)', marginBottom: '12px', fontSize: '14px'}}, "Add items like year's allowance, ED awards, etc."),
        React.createElement('button', {className: 'esc-btn esc-btn-small esc-btn-secondary', onClick: addSpouseItem}, React.createElement(Plus), ' Add Item')
      ) : React.createElement(React.Fragment, null,
        spouseRec.items.map((item, i) => React.createElement('div', {key: item.id, className: 'esc-asset-card', style: {padding: '12px'}},
          React.createElement('div', {style: {display: 'flex', gap: '12px', alignItems: 'flex-end', flexWrap: 'wrap'}},
            React.createElement('div', {style: {flex: 2, minWidth: '150px'}},
              React.createElement(Input, {label: 'Description', value: item.desc, onChange: v => updateSpouseItem(item.id, 'desc', v), placeholder: 'e.g., ED award'})
            ),
            React.createElement('div', {style: {flex: 1, minWidth: '100px'}},
              React.createElement(Input, {label: 'Value', prefix: '$', value: item.value, onChange: v => updateSpouseItem(item.id, 'value', v), placeholder: '0.00'})
            ),
            React.createElement('button', {className: 'esc-btn esc-btn-small', style: {color: 'var(--esc-error)', padding: '8px', marginBottom: '20px'}, onClick: () => removeSpouseItem(item.id)}, React.createElement(Trash))
          )
        )),
        React.createElement('button', {className: 'esc-btn esc-btn-small esc-btn-secondary', style: {marginBottom: '24px'}, onClick: addSpouseItem}, React.createElement(Plus), ' Add Another')
      ),
      React.createElement(Input, {label: "Spouse's Year's Allowance", prefix: '$', value: spouseRec.yearsAllowance, onChange: v => setSpouseRec({...spouseRec, yearsAllowance: v}), placeholder: '0.00'}),
      advanced && React.createElement(React.Fragment, null,
        React.createElement('h4', {style: {fontSize: '14px', fontWeight: '600', marginTop: '24px', marginBottom: '12px', color: 'var(--esc-text-med)'}}, 'Reductions to Net Property Passing'),
        React.createElement('div', {className: 'esc-grid esc-grid-2'},
          React.createElement(Input, {label: 'Death Taxes Attributable', prefix: '$', value: spouseRec.taxesAttr, onChange: v => setSpouseRec({...spouseRec, taxesAttr: v}), placeholder: '0.00'}),
          React.createElement(Input, {label: 'Claims Allocated to Spouse', prefix: '$', value: spouseRec.claimsAlloc, onChange: v => setSpouseRec({...spouseRec, claimsAlloc: v}), placeholder: '0.00'})
        )
      ),
      React.createElement('div', {className: 'esc-summary-box'},
        React.createElement('div', {className: 'esc-summary-row'},
          React.createElement('span', null, 'Gross Property Passing:'),
          React.createElement('span', {style: {fontWeight: '500'}}, fmt(calc.pp))
        ),
        advanced && React.createElement('div', {className: 'esc-summary-row total'},
          React.createElement('span', {style: {fontWeight: '600'}}, 'Net Property Passing:'),
          React.createElement('span', {style: {fontSize: '18px', fontWeight: '600', color: 'var(--esc-primary)'}}, fmt(calc.npp))
        )
      )
    );

    const renderStep4 = () => React.createElement(React.Fragment, null,
      React.createElement('h2', {className: 'esc-title'}, 'Deductions'),
      React.createElement('p', {className: 'esc-desc'}, "Enter claims against the estate and year's allowance to others."),
      React.createElement(Input, {label: 'Total Claims', hint: 'Debts, funeral, admin costs', prefix: '$', value: deductions.totalClaims, onChange: v => setDeductions({...deductions, totalClaims: v}), placeholder: '0.00'}),
      React.createElement(Input, {label: "Year's Allowance to Others", hint: 'If paid to children or others', prefix: '$', value: deductions.yearsAllowanceOthers, onChange: v => setDeductions({...deductions, yearsAllowanceOthers: v}), placeholder: '0.00'}),
      React.createElement('div', {className: 'esc-summary-box'},
        React.createElement('div', {className: 'esc-summary-row'}, React.createElement('span', null, 'Total Assets:'), React.createElement('span', {style: {fontWeight: '500'}}, fmt(calc.ta))),
        React.createElement('div', {className: 'esc-summary-row'}, React.createElement('span', null, 'Less Claims:'), React.createElement('span', {style: {fontWeight: '500'}}, '(' + fmt(calc.cl) + ')')),
        React.createElement('div', {className: 'esc-summary-row'}, React.createElement('span', null, "Less Year's Allowance to Others:"), React.createElement('span', {style: {fontWeight: '500'}}, '(' + fmt(calc.yao) + ')')),
        React.createElement('div', {className: 'esc-summary-row total'},
          React.createElement('span', {style: {fontWeight: '600'}}, 'Total Net Assets:'),
          React.createElement('span', {style: {fontSize: '18px', fontWeight: '600', color: 'var(--esc-primary)'}}, fmt(calc.tna))
        )
      )
    );

    const renderStep5 = () => React.createElement(React.Fragment, null,
      React.createElement('h2', {className: 'esc-title'}, 'Review & Calculate'),
      React.createElement('p', {className: 'esc-desc'}, 'Review the summary and accept the disclaimer to view results.'),
      warnings.length > 0 && React.createElement('div', {style: {marginBottom: '24px'}},
        React.createElement('h4', {style: {fontSize: '14px', fontWeight: '600', marginBottom: '12px', color: 'var(--esc-warning)'}}, React.createElement(Warning), ' Warnings'),
        warnings.map((w, i) => React.createElement(Alert, {key: i, type: w.type}, w.msg))
      ),
      React.createElement('div', {style: {background: 'var(--esc-light)', borderRadius: '8px', padding: '20px', marginBottom: '24px'}},
        React.createElement('h4', {style: {fontSize: '16px', marginBottom: '16px', color: 'var(--esc-primary)'}}, 'Summary'),
        React.createElement('div', {style: {display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', fontSize: '14px'}},
          React.createElement('div', null, React.createElement('strong', null, 'Marriage:')), React.createElement('div', null, calc.years + ' years (' + pct(calc.appPct) + ')'),
          React.createElement('div', null, React.createElement('strong', null, 'Total Assets:')), React.createElement('div', null, fmt(calc.ta)),
          React.createElement('div', null, React.createElement('strong', null, 'Total Net Assets:')), React.createElement('div', null, fmt(calc.tna)),
          React.createElement('div', null, React.createElement('strong', null, 'Preliminary Share:')), React.createElement('div', null, fmt(calc.prelim)),
          React.createElement('div', null, React.createElement('strong', null, 'Net Property Passing:')), React.createElement('div', null, fmt(calc.npp)),
          React.createElement('div', {style: {gridColumn: '1 / -1', borderTop: '1px solid var(--esc-border-med)', paddingTop: '12px', marginTop: '8px'}},
            React.createElement('strong', {style: {color: 'var(--esc-primary)'}}, 'Estimated Elective Share: ' + fmt(calc.es))
          )
        )
      ),
      React.createElement('div', {style: {padding: '20px', border: '2px solid var(--esc-border-med)', borderRadius: '8px', background: 'var(--esc-white)'}},
        React.createElement('h4', {style: {fontSize: '14px', fontWeight: '600', marginBottom: '12px'}}, 'Disclaimer'),
        React.createElement('p', {style: {fontSize: '13px', color: 'var(--esc-text-med)', marginBottom: '16px', lineHeight: '1.7'}}, 'This calculator provides an estimate for informational purposes only and does not constitute legal advice. Complex situations should be reviewed by a licensed NC attorney.'),
        React.createElement('label', {className: 'esc-checkbox'},
          React.createElement('input', {type: 'checkbox', checked: agreed, onChange: e => setAgreed(e.target.checked)}),
          React.createElement('span', {style: {fontSize: '14px', fontWeight: '500'}}, 'I understand and accept these terms')
        )
      )
    );

    const renderResults = () => React.createElement(React.Fragment, null,
      React.createElement('div', {className: 'esc-result-box'},
        React.createElement('div', {className: 'esc-result-label'}, 'Elective Share Amount'),
        React.createElement('div', {className: 'esc-result-amount'}, fmt(calc.es)),
        calc.es === 0 && React.createElement('div', {style: {fontSize: '14px', opacity: 0.9, marginTop: '8px'}}, "Spouse's receipts meet or exceed the elective share.")
      ),
      warnings.length > 0 && React.createElement('div', {style: {marginBottom: '24px'}}, warnings.map((w, i) => React.createElement(Alert, {key: i, type: w.type}, w.msg))),
      React.createElement('h3', {className: 'esc-title', style: {fontSize: '18px', marginBottom: '16px'}}, 'Calculation Breakdown'),
      React.createElement('table', {className: 'esc-table'},
        React.createElement('tbody', null,
          React.createElement('tr', null, React.createElement('td', null, 'Total Assets'), React.createElement('td', {style: {textAlign: 'right'}}, fmt(calc.ta))),
          React.createElement('tr', null, React.createElement('td', null, 'Less: Claims'), React.createElement('td', {style: {textAlign: 'right'}}, '(' + fmt(calc.cl) + ')')),
          React.createElement('tr', null, React.createElement('td', null, "Less: Year's Allowance to Others"), React.createElement('td', {style: {textAlign: 'right'}}, '(' + fmt(calc.yao) + ')')),
          React.createElement('tr', {className: 'highlight'}, React.createElement('td', null, React.createElement('strong', null, 'Total Net Assets')), React.createElement('td', {style: {textAlign: 'right'}}, React.createElement('strong', null, fmt(calc.tna)))),
          React.createElement('tr', null, React.createElement('td', null, 'Applicable % (' + calc.years + ' years)'), React.createElement('td', {style: {textAlign: 'right'}}, '× ' + pct(calc.appPct))),
          React.createElement('tr', {className: 'highlight'}, React.createElement('td', null, React.createElement('strong', null, 'Preliminary Share')), React.createElement('td', {style: {textAlign: 'right'}}, React.createElement('strong', null, fmt(calc.prelim)))),
          React.createElement('tr', null, React.createElement('td', null, 'Property Passing to Spouse'), React.createElement('td', {style: {textAlign: 'right'}}, fmt(calc.pp))),
          React.createElement('tr', null, React.createElement('td', null, 'Less: Taxes Attributable'), React.createElement('td', {style: {textAlign: 'right'}}, '(' + fmt(calc.tx) + ')')),
          React.createElement('tr', null, React.createElement('td', null, 'Less: Claims Allocated'), React.createElement('td', {style: {textAlign: 'right'}}, '(' + fmt(calc.cs) + ')')),
          React.createElement('tr', {className: 'highlight'}, React.createElement('td', null, React.createElement('strong', null, 'Net Property Passing')), React.createElement('td', {style: {textAlign: 'right'}}, React.createElement('strong', null, fmt(calc.npp)))),
          React.createElement('tr', {className: 'total'}, React.createElement('td', null, 'Elective Share'), React.createElement('td', {style: {textAlign: 'right'}}, fmt(calc.es)))
        )
      ),
      calc.apportion.length > 0 && calc.es > 0 && React.createElement('div', {className: 'esc-apportion-section'},
        React.createElement('h3', {className: 'esc-title', style: {fontSize: '18px', marginBottom: '16px'}}, 'Who Pays (Apportionment)'),
        React.createElement('p', {style: {fontSize: '14px', color: 'var(--esc-text-med)', marginBottom: '16px'}}, 'Each responsible person pays their pro rata share based on their portion of nonspousal assets.'),
        calc.apportion.map((p, i) => React.createElement('div', {key: i, className: 'esc-apportion-item'},
          React.createElement('div', null,
            React.createElement('div', {className: 'esc-apportion-name'}, p.name),
            React.createElement('div', {className: 'esc-apportion-type'}, RESPONSIBLE_TYPES.find(t => t.value === p.type)?.label || p.type)
          ),
          React.createElement('div', {className: 'esc-apportion-value'},
            React.createElement('div', {className: 'esc-apportion-share'}, fmt(p.share)),
            React.createElement('div', {className: 'esc-apportion-pct'}, p.pct.toFixed(1) + '% of liability')
          )
        ))
      ),
      calc.deadline && React.createElement('div', {className: 'esc-deadline-box ' + (calc.deadline < new Date() ? 'passed' : Math.ceil((calc.deadline - new Date())/(1000*60*60*24)) <= 30 ? 'urgent' : 'ok'), style: {marginTop: '24px'}},
        React.createElement(Calendar),
        React.createElement('div', null,
          React.createElement('strong', null, 'Filing Deadline: ' + calc.deadline.toLocaleDateString('en-US', {weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'})),
          basics.claimAfter2026 && React.createElement('div', {style: {fontSize: '13px', marginTop: '4px'}}, '2026 rules apply: verified petition required, Rule 4 service.')
        )
      )
    );

    return React.createElement('div', {className: 'esc-card'},
      React.createElement('div', {className: 'esc-header'},
        React.createElement('h1', null, 'NC Elective Share Calculator'),
        React.createElement('p', null, 'Guided Wizard'),
        advanced && React.createElement('div', {style: {marginTop: '8px'}}, React.createElement('span', {className: 'esc-tag', style: {background: 'var(--esc-primary-light)'}}, 'Advanced Mode'))
      ),
      React.createElement('div', {className: 'esc-progress esc-no-print'},
        steps.map(s => React.createElement('div', {
          key: s.n,
          className: 'esc-step' + (step === s.n && !showResults ? ' active' : '') + (step > s.n || showResults ? ' complete' : ''),
          onClick: () => (step > s.n || showResults) && goStep(s.n)
        }, step > s.n || showResults ? React.createElement(Check) : s.n, ' ', s.l))
      ),
      React.createElement('div', {className: 'esc-content'},
        !showResults && warnings.length > 0 && step !== 5 && React.createElement('div', {style: {marginBottom: '24px'}}, warnings.map((w, i) => React.createElement(Alert, {key: i, type: w.type}, w.msg))),
        !showResults && step === 1 && renderStep1(),
        !showResults && step === 2 && renderStep2(),
        !showResults && step === 3 && renderStep3(),
        !showResults && step === 4 && renderStep4(),
        !showResults && step === 5 && renderStep5(),
        showResults && renderResults(),
        React.createElement('div', {className: 'esc-btn-group esc-no-print'},
          React.createElement('button', {className: 'esc-btn esc-btn-secondary', onClick: showResults ? prev : step === 1 ? () => setMode(null) : prev},
            React.createElement(ChevronLeft), showResults ? ' Edit' : step === 1 ? ' Back' : ' Previous'
          ),
          React.createElement('div', {style: {display: 'flex', gap: '12px', flexWrap: 'wrap'}},
            React.createElement('button', {className: 'esc-btn esc-btn-secondary', onClick: handleClear}, 'Clear'),
            showResults ?
              React.createElement('button', {className: 'esc-btn esc-btn-outline', onClick: () => window.print()}, React.createElement(Print), ' Print') :
              React.createElement('button', {
                className: 'esc-btn esc-btn-primary',
                onClick: next,
                disabled: step === 5 && !agreed
              }, step === 5 ? 'View Results ' : 'Next ', React.createElement(ChevronRight))
          )
        )
      ),
      React.createElement('div', {className: 'esc-footer'}, 'This calculator is for informational purposes only and does not constitute legal advice.')
    );
  };

  // Mount
  const container = document.getElementById('nc-elective-share-calculator');
  const root = ReactDOM.createRoot(container);
  root.render(React.createElement(Calculator));
})();
